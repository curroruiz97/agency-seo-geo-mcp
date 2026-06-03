import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env.js";
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

type ProjectCapabilityFlags = {
  canCreateDrafts: boolean;
  canUpdateRankmath: boolean;
  canUpdateElementor: boolean;
  canPublish: boolean;
  canChangeSlugs: boolean;
  canChangeCanonical: boolean;
  canChangeRobots: boolean;
  requiresHumanApproval: boolean;
};

export class ExecuteService {
  constructor(
    private prisma: PrismaClient,
    private credentials: CredentialsService,
    private config: AppConfig,
    private logger?: Logger
  ) {}

  async applyApprovedRequest(changeRequestId: string): Promise<ApplyResult> {
    const cr = await this.prisma.changeRequest.findUniqueOrThrow({
      where: { id: changeRequestId },
      include: { project: { include: { capabilities: true } } }
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

    // --- Safety gates -------------------------------------------------------
    // These checks deliberately do NOT flip the ChangeRequest status, so the
    // same request can be retried after READ_ONLY_MODE is lifted or the
    // project's capabilities are granted.
    if (this.config.READ_ONLY_MODE) {
      const error =
        "READ_ONLY_MODE is enabled; external writes are blocked. Set READ_ONLY_MODE=false to allow approved executions.";
      await log({ ok: false, error });
      return { ok: false, changeRequestId: cr.id, error };
    }

    const denial = this.checkCapabilities(cr);
    if (denial) {
      await log({ ok: false, error: denial });
      return { ok: false, changeRequestId: cr.id, error: denial };
    }

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
        case "rankmath_update_focus_keywords":
          applied = await this.applyUpdateFocusKeywords(project, cr);
          break;
        case "rankmath_update_schema_config":
          applied = await this.applyUpdateSchema(project, cr);
          break;
        case "rankmath_update_canonical":
          applied = await this.applyUpdateCanonical(project, cr);
          break;
        case "rankmath_update_robots":
          applied = await this.applyUpdateRobots(project, cr);
          break;
        case "rankmath_create_redirection":
          applied = await this.applyCreateRedirection(project, cr);
          break;
        case "wordpress_upload_media":
          throw new Error(
            "wordpress_upload_media is not executable yet: media upload needs a validated source URL " +
              "(SSRF protection pending). Upload media in WordPress directly for now."
          );
        default:
          throw new Error(`Unsupported changeType: ${cr.changeType}`);
      }

      // Post-execution verification (P7): re-read the live entity and stamp
      // verifiedAt. Non-fatal — a verification error never flips the apply to
      // failed, since the write already succeeded downstream.
      let verified: Record<string, unknown>;
      try {
        verified = await this.verifyChange(project.id, cr, applied);
      } catch (verifyErr) {
        verified = { ok: false, error: verifyErr instanceof Error ? verifyErr.message : String(verifyErr) };
      }
      const verifiedOk = verified["ok"] === true;
      await this.prisma.changeRequest.update({
        where: { id: cr.id },
        data: {
          status: "applied",
          appliedAt: new Date(),
          verifiedAt: verifiedOk ? new Date() : null,
          diffPayload: { applied, verified } as never
        }
      });
      applied = { ...applied, verified };
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

  /**
   * Enforce the per-project ProjectCapability flags. Returns a human-readable
   * denial reason, or null when the change is allowed. A missing capability row
   * falls back to the safe schema defaults (writes disabled, approval required).
   *
   * NOTE: with a single shared MCP_BEARER_TOKEN there is no per-user identity,
   * so true separation-of-duties (proposer ≠ approver) cannot be enforced here.
   * These flags + READ_ONLY_MODE + the approvedBy audit trail are the available
   * mitigations until an authenticated user layer exists.
   */
  private checkCapabilities(cr: {
    changeType: string;
    approvedBy: string | null;
    afterPayload: unknown;
    project: { capabilities: ProjectCapabilityFlags | null };
  }): string | null {
    const c = cr.project.capabilities;
    const cap = {
      canCreateDrafts: c?.canCreateDrafts ?? false,
      canUpdateRankmath: c?.canUpdateRankmath ?? false,
      canUpdateElementor: c?.canUpdateElementor ?? false,
      canPublish: c?.canPublish ?? false,
      canChangeSlugs: c?.canChangeSlugs ?? false,
      canChangeCanonical: c?.canChangeCanonical ?? false,
      canChangeRobots: c?.canChangeRobots ?? false,
      requiresHumanApproval: c?.requiresHumanApproval ?? true
    };
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const ct = cr.changeType;
    const deny = (flag: string) =>
      `Capability denied for this project: ${flag} is disabled. Enable it on the project's ProjectCapability to allow this change.`;

    if (cap.requiresHumanApproval && !cr.approvedBy) {
      return "This project requires human approval but the change request has no approvedBy. Approve it with an explicit reviewer first.";
    }
    if (payload["status"] === "publish" && !cap.canPublish) return deny("canPublish");
    if (typeof payload["slug"] === "string" && payload["slug"] && !cap.canChangeSlugs) return deny("canChangeSlugs");
    if (ct.startsWith("rankmath_") && !cap.canUpdateRankmath) return deny("canUpdateRankmath");
    if (ct === "wordpress_create_post_with_elementor" && !cap.canUpdateElementor) return deny("canUpdateElementor");
    if (
      (ct === "wordpress_create_post" || ct === "wordpress_create_post_with_elementor") &&
      !cap.canCreateDrafts
    ) {
      return deny("canCreateDrafts");
    }
    if (ct === "rankmath_update_canonical" && !cap.canChangeCanonical) return deny("canChangeCanonical");
    if (ct === "rankmath_update_robots" && !cap.canChangeRobots) return deny("canChangeRobots");
    return null;
  }

  /**
   * Re-read the live entity after an apply to confirm the change landed (P7).
   * Returns a compact verification object stored in diffPayload.verified and
   * used to decide whether to stamp verifiedAt.
   */
  private async verifyChange(
    projectId: string,
    cr: { changeType: string; targetEntityId: string | null; targetEntityType: string },
    applied: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const type = cr.targetEntityType.endsWith("page") ? "page" : "post";

    if (
      cr.changeType === "wordpress_create_post" ||
      cr.changeType === "wordpress_create_post_with_elementor" ||
      cr.changeType === "wordpress_update_post" ||
      cr.changeType === "wordpress_update_page"
    ) {
      const id = parsePostId(applied["postId"] ?? cr.targetEntityId);
      if (!id) return { ok: false, error: "No post id available to verify." };
      const wp = await this.wpClient(projectId);
      const post = await wp.getPost(id, type);
      return {
        ok: true,
        kind: "wordpress_post",
        postId: post.id,
        status: post.status,
        slug: post.slug,
        title: post.title,
        link: post.link,
        hasContent: Boolean(post.content && post.content.length > 0),
        featuredMediaId: post.featuredMediaId ?? null
      };
    }

    if (cr.changeType.startsWith("rankmath_")) {
      const id = parsePostId(cr.targetEntityId ?? applied["postId"]);
      if (!id) return { ok: false, error: "No post id available to verify." };
      const rm = await this.rankmathClient(projectId);
      const meta = await rm.getPostMeta(id, type);
      return { ok: true, kind: "rankmath_meta", meta };
    }

    return { ok: true, kind: "none", note: "Verification not implemented for this change type." };
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

  private async applyRankMathMetadata(project: { id: string }, cr: { id: string; afterPayload: unknown; targetEntityId: string | null; targetEntityType: string; url: string | null }): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const postId = parsePostId(cr.targetEntityId ?? payload["postId"]);
    if (!postId) throw new Error("Cannot determine post id for RankMath update.");
    const type = cr.targetEntityType.endsWith("page") ? "page" : "post";

    const before = await rm.getPostMeta(postId, type);
    // Accept BOTH the update_rankmath_metadata tool payload (snake_case:
    // seo_title, meta_description, focus_keywords[], schema_type) and the
    // strategy payload (camelCase: metaTitle, focusKeyword...). The earlier
    // mismatch is why writes returned ok:true but applied nothing.
    const focusList = Array.isArray(payload["focus_keywords"])
      ? (payload["focus_keywords"] as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : undefined;
    const metaTitle = (payload["seo_title"] ?? payload["metaTitle"]) as string | undefined;
    const metaDescription = (payload["meta_description"] ?? payload["metaDescription"]) as string | undefined;
    const focusKeyword = focusList ? focusList[0] : (payload["focusKeyword"] as string | undefined);
    const secondaryKeywords = focusList ? focusList.slice(1) : (payload["secondaryKeywords"] as string[] | undefined);
    const schemaType = (payload["schema_type"] ?? payload["schemaType"]) as string | undefined;
    const schemaPayload = (payload["schema_payload"] ?? payload["schemaPayload"]) as Record<string, unknown> | undefined;
    const next = await rm.updatePostMeta(
      { postId, metaTitle, metaDescription, focusKeyword, secondaryKeywords, schemaType },
      type
    );
    // RankMath stores schema objects under their own meta keys (rank_math_schema_<Type>),
    // written through the mu-plugin bridge rather than the standard meta surface.
    if (schemaType && schemaPayload) {
      await rm.setSchema(postId, schemaType, schemaPayload);
    }
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
      tags: (p["tags"] as number[]) ?? undefined,
      featured_media: typeof p["featured_media"] === "number" ? (p["featured_media"] as number) : undefined
    });
    return { postId: created.id, link: created.link, status: created.status, slug: created.slug };
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

  private async applyUpdatePost(project: { id: string }, cr: { id: string; afterPayload: unknown; targetEntityId: string | null; targetEntityType: string }): Promise<Record<string, unknown>> {
    const wp = await this.wpClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const id = parsePostId(cr.targetEntityId);
    if (!id) throw new Error("targetEntityId required for update.");
    // Producers emit "wordpress_page" / "wp_page" / "rankmath_page"; anything
    // ending in "page" must hit the pages endpoint, not posts.
    const type = cr.targetEntityType.endsWith("page") ? "page" : "post";
    const before = await wp.getPost(id, type);
    // Persist a rollback snapshot before mutating, so the change can be reverted.
    await this.prisma.changeRequest.update({
      where: { id: cr.id },
      data: {
        beforePayload: { title: before.title, content: before.content, status: before.status, slug: before.slug } as never,
        rollbackPayload: { id, type, title: before.title, content: before.content, status: before.status, slug: before.slug } as never
      }
    });
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

  private async applyUpdateFocusKeywords(
    project: { id: string },
    cr: { afterPayload: unknown; targetEntityId: string | null; targetEntityType: string }
  ): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const postId = parsePostId(cr.targetEntityId ?? payload["postId"]);
    if (!postId) throw new Error("Cannot determine post id for focus keyword update.");
    const type = cr.targetEntityType.endsWith("page") ? "page" : "post";
    const raw = payload["focus_keywords"] ?? payload["focusKeywords"];
    const list = Array.isArray(raw) ? raw.map((x) => String(x).trim()).filter(Boolean) : [];
    if (list.length === 0) throw new Error("focus_keywords is required and must be a non-empty array.");
    const before = await rm.getPostMeta(postId, type);
    const after = await rm.updatePostMeta({ postId, focusKeyword: list[0], secondaryKeywords: list.slice(1) }, type);
    return { before, after };
  }

  private async applyUpdateSchema(
    project: { id: string },
    cr: { afterPayload: unknown; targetEntityId: string | null; targetEntityType: string }
  ): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const postId = parsePostId(cr.targetEntityId ?? payload["postId"]);
    if (!postId) throw new Error("Cannot determine post id for schema update.");
    const schemaType = String(payload["schema_type"] ?? payload["schemaType"] ?? "").trim();
    if (!schemaType) throw new Error("schema_type is required for a schema update.");
    const schemaPayload = (payload["schema_payload"] ?? payload["schemaPayload"]) as
      | Record<string, unknown>
      | undefined;
    const result = await rm.setSchema(postId, schemaType, schemaPayload ?? { "@type": schemaType });
    return { schema: result };
  }

  private async applyUpdateCanonical(
    project: { id: string },
    cr: { afterPayload: unknown; targetEntityId: string | null; targetEntityType: string }
  ): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const postId = parsePostId(cr.targetEntityId ?? payload["postId"]);
    if (!postId) throw new Error("Cannot determine post id for canonical update.");
    const type = cr.targetEntityType.endsWith("page") ? "page" : "post";
    const canonical = payload["canonical_url"] ?? payload["canonicalUrl"];
    if (typeof canonical !== "string" || !canonical) {
      throw new Error("canonical_url is required to apply a canonical change.");
    }
    const before = await rm.getPostMeta(postId, type);
    const after = await rm.updatePostMeta({ postId, canonicalUrl: canonical }, type);
    return { before, after };
  }

  private async applyUpdateRobots(
    project: { id: string },
    cr: { afterPayload: unknown; targetEntityId: string | null; targetEntityType: string }
  ): Promise<Record<string, unknown>> {
    const rm = await this.rankmathClient(project.id);
    const payload = (cr.afterPayload as Record<string, unknown>) ?? {};
    const postId = parsePostId(cr.targetEntityId ?? payload["postId"]);
    if (!postId) throw new Error("Cannot determine post id for robots update.");
    const type = cr.targetEntityType.endsWith("page") ? "page" : "post";
    const raw = payload["robots"];
    const robots = Array.isArray(raw) ? raw.map((x) => String(x).trim()).filter(Boolean) : [];
    if (robots.length === 0) {
      throw new Error('robots is required and must be a non-empty array (e.g. ["noindex","nofollow"]).');
    }
    const before = await rm.getPostMeta(postId, type);
    const after = await rm.updatePostMeta({ postId, robots }, type);
    return { before, after };
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
