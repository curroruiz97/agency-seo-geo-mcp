import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { WordPressClient } from "../clients/wordpress.js";
import { RankMathClient } from "../clients/rankmath.js";
import { ElementorAdapter, type ElementorBlock } from "../clients/elementor.js";
import { CredentialsService } from "./credentials.js";

/**
 * ExecuteService: consumes an *approved* ChangeRequest and applies it via the
 * appropriate downstream client (WordPress, RankMath, Elementor).
 *
 * Workflow:
 *   ChangeRequest status: proposed → approved → applied (or failed)
 *
 * This service expects an external approval step (human or automated) that
 * flips status from "proposed" to "approved" before execution. It refuses to
 * apply requests that are not in "approved" status, which keeps the system
 * safe under READ_ONLY_MODE / permission_level rules.
 */

export interface ApplyResult {
  ok: boolean;
  changeRequestId: string;
  applied?: Record<string, unknown>;
  error?: string;
}

export class ExecuteService {
  constructor(
    private prisma: PrismaClient,
    private credentials: CredentialsService,
    private logger?: Logger
  ) {}

  async applyApprovedRequest(changeRequestId: string): Promise<ApplyResult> {
    const cr = await this.prisma.changeRequest.findUniqueOrThrow({
      where: { id: changeRequestId },
      include: { project: true }
    });
    if (cr.status !== "approved") {
      throw new Error(`ChangeRequest ${changeRequestId} is not approved (status=${cr.status}).`);
    }

    const project = cr.project;
    const log = (data: Record<string, unknown>) =>
      this.prisma.actionLog.create({
        data: {
          projectId: project.id,
          changeRequestId: cr.id,
          toolName: "execute_service",
          actionType: cr.changeType,
          status: data.ok ? "success" : "error",
          inputPayload: cr.afterPayload as never,
          outputPayload: data as never,
          errorMessage: typeof data["error"] === "string" ? (data["error"] as string) : undefined
        }
      });

    try {
      let applied: Record<string, unknown>;
      switch (cr.changeType) {
        case "rankmath_optimise_existing_post":
        case "rankmath_update_metadata":
          applied = await this.applyRankMathMetadata(project, cr);
          break;
        case "wordpress_create_post_with_elementor":
          applied = await this.applyCreatePostElementor(project, cr);
          break;
        case "wordpress_create_post":
          applied = await this.applyCreatePost(project, cr);
          break;
        case "wordpress_update_post":
        case "wordpress_update_page":
          applied = await this.applyUpdatePost(project, cr);
          break;
        case "rankmath_create_redirection":
          applied = await this.applyCreateRedirection(project, cr);
          break;
        default:
          throw new Error(`Unsupported changeType: ${cr.changeType}`);
      }

      await this.prisma.changeRequest.update({
        where: { id: cr.id },
        data: { status: "applied", appliedAt: new Date(), diffPayload: applied as never }
      });
      await log({ ok: true, applied });
      return { ok: true, changeRequestId: cr.id, applied };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.changeRequest.update({
        where: { id: cr.id },
        data: { status: "failed" }
      });
      await log({ ok: false, error: errorMessage });
      return { ok: false, changeRequestId: cr.id, error: errorMessage };
    }
  }

  private async wpClient(projectId: string): Promise<WordPressClient> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const creds = await this.credentials.getWordPress(projectId);
    if (!creds) throw new Error(`WordPress credentials not configured for project ${projectId}.`);
    return new WordPressClient({
      baseUrl: project.wordpressUrl,
      username: creds.username,
      applicationPassword: creds.applicationPassword,
      logger: this.logger
    });
  }

  private async rankmathClient(projectId: string): Promise<RankMathClient> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const creds = await this.credentials.getWordPress(projectId);
    if (!creds) throw new Error(`WordPress credentials not configured for project ${projectId}.`);
    return new RankMathClient({
      baseUrl: project.wordpressUrl,
      username: creds.username,
      applicationPassword: creds.applicationPassword,
      logger: this.logger
    });
  }

  private async applyRankMathMetadata(project: { id: string }, cr: { id: string; afterPayload: unknown; targetEntityId: string | null; url: string | null }): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const postId = parsePostId(cr.targetEntityId ?? payload["postId"]);
    if (!postId) throw new Error("Cannot determine post id for RankMath update.");

    const before = await rm.getPostMeta(postId);
    const next = await rm.updatePostMeta({
      postId,
      metaTitle: payload["metaTitle"] as string | undefined,
      metaDescription: payload["metaDescription"] as string | undefined,
      focusKeyword: payload["focusKeyword"] as string | undefined,
      secondaryKeywords: payload["secondaryKeywords"] as string[] | undefined,
      schemaType: payload["schemaType"] as string | undefined,
      schemaPayload: payload["schemaPayload"] as Record<string, unknown> | undefined
    });
    await this.prisma.changeRequest.update({
      where: { id: cr.id },
      data: { beforePayload: before as never, rollbackPayload: before as never }
    });
    return { before, after: next };
  }

  private async applyCreatePost(project: { id: string }, cr: { afterPayload: unknown }): Promise<Record<string, unknown>> {
    const wp = await this.wpClient(project.id);
    const p = (cr.afterPayload as Record<string, unknown>) ?? {};
    const created = await wp.createPost({
      title: String(p["title"] ?? "Untitled"),
      content: String(p["content"] ?? ""),
      status: (p["status"] as "draft" | "publish" | "pending") ?? "draft",
      slug: p["slug"] as string | undefined,
      excerpt: p["excerpt"] as string | undefined,
      categories: (p["categories"] as number[]) ?? undefined,
      tags: (p["tags"] as number[]) ?? undefined
    });
    return { postId: created.id, link: created.link };
  }

  private async applyCreatePostElementor(project: { id: string }, cr: { afterPayload: unknown }): Promise<Record<string, unknown>> {
    const wp = await this.wpClient(project.id);
    const elementor = new ElementorAdapter({ wp });
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};

    const draftId = payload["contentDraftId"] as string | undefined;
    if (!draftId) throw new Error("contentDraftId missing in afterPayload.");
    const draft = await this.prisma.contentDraft.findUniqueOrThrow({ where: { id: draftId } });

    const blocks: ElementorBlock[] = (Array.isArray(draft.outline) ? (draft.outline as unknown as { sections?: Array<{ heading: string; level: number }> }) : (draft.outline as { sections?: Array<{ heading: string; level: number }> } | null))?.sections
      ?.map((s) => ({
        type: "heading",
        level: Math.min(4, Math.max(1, s.level)) as 1 | 2 | 3 | 4,
        text: s.heading
      } satisfies ElementorBlock))
      ?? [{ type: "heading", level: 1, text: draft.topic }];

    // Add a paragraph after each heading as placeholder; content gen is out of scope here.
    const blocksWithBody: ElementorBlock[] = [];
    for (const b of blocks) {
      blocksWithBody.push(b);
      if (b.type === "heading" && b.level >= 2) {
        blocksWithBody.push({
          type: "paragraph",
          html: `Contenido pendiente sobre <strong>${b.text}</strong> orientado a la keyword "${draft.primaryKeyword}".`
        });
      }
    }
    if (draft.faqSchema && Array.isArray((draft.faqSchema as { items?: unknown[] }).items)) {
      blocksWithBody.push({
        type: "faq",
        items: ((draft.faqSchema as { items: Array<{ question: string; answer: string }> }).items) ?? []
      });
    }

    const created = await elementor.createPost({
      title: draft.metaTitle ?? draft.topic,
      slug: undefined,
      status: "draft",
      type: "post",
      blocks: blocksWithBody
    });
    await this.prisma.contentDraft.update({
      where: { id: draft.id },
      data: { status: "ready", wpPostId: String(created.id) }
    });
    return { postId: created.id, draftId: draft.id, previewLink: created.link };
  }

  private async applyUpdatePost(project: { id: string }, cr: { afterPayload: unknown; targetEntityId: string | null; targetEntityType: string }): Promise<Record<string, unknown>> {
    const wp = await this.wpClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const id = parsePostId(cr.targetEntityId);
    if (!id) throw new Error("targetEntityId required for update.");
    const type = cr.targetEntityType === "wp_page" ? "page" : "post";
    const before = await wp.getPost(id, type);
    const updated = await wp.updatePost({
      id,
      type,
      title: payload["title"] as string | undefined,
      content: payload["content"] as string | undefined,
      status: payload["status"] as "draft" | "publish" | "pending" | "private" | undefined,
      slug: payload["slug"] as string | undefined,
      excerpt: payload["excerpt"] as string | undefined
    });
    return { before: { title: before.title, content: before.content }, after: { id: updated.id, link: updated.link } };
  }

  private async applyCreateRedirection(project: { id: string }, cr: { afterPayload: unknown }): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const p = (cr.afterPayload as Record<string, unknown>) ?? {};
    const created = await rm.createRedirection({
      sources: [{ pattern: String(p["sourceUrl"] ?? p["source_url"] ?? ""), comparison: "exact" }],
      url_to: String(p["destinationUrl"] ?? p["destination_url"] ?? ""),
      status_code: (p["statusCode"] as 301 | 302 | 307 | 410) ?? 301
    });
    return { redirectionId: created.id };
  }
}

function parsePostId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}
