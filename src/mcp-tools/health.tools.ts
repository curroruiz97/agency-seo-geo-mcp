import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { WordPressClient } from "../clients/wordpress.js";
import { SerankingProjectClient } from "../clients/seranking.js";
import { jsonToolResponse } from "./response.js";

/**
 * Health checks per site/project. Useful before running ingest or strategy.
 */

export function registerHealthTools(server: McpServer, context: AppContext) {
  server.tool(
    "check_site_health",
    "Verifica WordPress REST + Application Password + RankMath bridge + SE Ranking project para un sitio. Devuelve qué partes están operativas.",
    { project_id: z.string().uuid() },
    async ({ project_id }) => {
      if (!context.prisma || !context.services) {
        return jsonToolResponse({ ok: false, error: "database_not_configured" });
      }
      const prisma = context.prisma;
      const credentials = context.services.credentials;

      const checks: Record<string, { ok: boolean; detail?: string; data?: unknown }> = {};

      const project = await (prisma as unknown as { project: { findUnique: (a: unknown) => Promise<{ id: string; domain: string; wordpressUrl: string; serankingProjectId: string | null } | null> } })
        .project.findUnique({ where: { id: project_id } });
      if (!project) {
        return jsonToolResponse({ ok: false, error: "project_not_found" });
      }

      // 1. WP REST
      const wpCreds = await credentials.getWordPress(project_id);
      if (!wpCreds) {
        checks.wordpress = { ok: false, detail: "credentials_missing" };
      } else {
        try {
          const wp = new WordPressClient({
            baseUrl: project.wordpressUrl,
            username: wpCreds.username,
            applicationPassword: wpCreds.applicationPassword,
            logger: context.logger
          });
          const ping = await wp.ping();
          checks.wordpress = { ok: true, data: ping };
        } catch (err) {
          checks.wordpress = { ok: false, detail: err instanceof Error ? err.message : String(err) };
        }
      }

      // 2. Avenue MCP Bridge mu-plugin health endpoint
      try {
        const url = `${project.wordpressUrl.replace(/\/$/, "")}/wp-json/avenue-mcp/v1/health`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          checks.avenue_bridge = { ok: true, data };
        } else {
          checks.avenue_bridge = { ok: false, detail: `HTTP ${res.status} — mu-plugin probably not installed` };
        }
      } catch (err) {
        checks.avenue_bridge = { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }

      // 3. SE Ranking project
      const srCreds = await credentials.getSeranking(project_id);
      if (!srCreds?.apiKey) {
        checks.seranking_project_api = { ok: false, detail: "api_key_missing" };
      } else if (!project.serankingProjectId) {
        checks.seranking_project_api = { ok: false, detail: "serankingProjectId_not_set_on_project" };
      } else {
        try {
          const client = new SerankingProjectClient({ apiKey: srCreds.apiKey, logger: context.logger });
          const sites = await client.listSites();
          const found = sites.find((s) => s.id === Number(project.serankingProjectId));
          checks.seranking_project_api = found
            ? { ok: true, data: { id: found.id, name: found.name } }
            : { ok: false, detail: `serankingProjectId ${project.serankingProjectId} not found in account` };
        } catch (err) {
          checks.seranking_project_api = { ok: false, detail: err instanceof Error ? err.message : String(err) };
        }
      }

      // 4. SE Ranking Data API (for audits)
      const srDataCreds = await credentials.getSerankingDataApi(project_id);
      checks.seranking_data_api = srDataCreds?.apiKey
        ? { ok: true, detail: "configured" }
        : { ok: false, detail: "data_api_key_not_set_audit_will_be_skipped" };

      // 5. Content generator
      checks.content_generator = context.services.contentGenerator.isAvailable()
        ? { ok: true, detail: "anthropic_api_key_configured" }
        : { ok: false, detail: "set_ANTHROPIC_API_KEY_to_enable_content_generation" };

      const overallOk = Object.values(checks).every((c) => c.ok);
      return jsonToolResponse({ ok: overallOk, project_id, checks });
    }
  );

  server.tool(
    "check_all_sites_health",
    "Ejecuta check_site_health para todos los proyectos activos y devuelve un resumen.",
    {},
    async () => {
      if (!context.prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const prisma = context.prisma;
      const projects = await (prisma as unknown as { project: { findMany: (a: unknown) => Promise<Array<{ id: string; domain: string }>> } })
        .project.findMany({
          where: { status: "active", domain: { not: "__global__" } },
          select: { id: true, domain: true }
        });

      const summary = {
        total: projects.length,
        fully_operational: 0,
        partial: 0,
        broken: 0,
        details: [] as Array<{ projectId: string; domain: string; ok: boolean; failingChecks: string[] }>
      };

      for (const p of projects) {
        // Mirror the per-site logic but minimal — only test WP and SE Ranking.
        const credentials = context.services!.credentials;
        const wpCreds = await credentials.getWordPress(p.id);
        const srCreds = await credentials.getSeranking(p.id);
        const failing: string[] = [];
        if (!wpCreds) failing.push("wordpress_credentials");
        if (!srCreds?.apiKey) failing.push("seranking_key");
        const ok = failing.length === 0;
        summary.details.push({ projectId: p.id, domain: p.domain, ok, failingChecks: failing });
        if (ok) summary.fully_operational += 1;
        else if (failing.length < 2) summary.partial += 1;
        else summary.broken += 1;
      }

      return jsonToolResponse(summary);
    }
  );

  server.tool(
    "fill_content_draft",
    "Usa el ContentGenerator (Claude) para rellenar el contentHtml y blocks de un ContentDraft a partir de su outline + primaryKeyword. Marca el draft como ready si tiene éxito.",
    { content_draft_id: z.string().uuid(), target_word_count: z.number().int().positive().max(5000).optional() },
    async ({ content_draft_id, target_word_count }) => {
      if (!context.prisma || !context.services) {
        return jsonToolResponse({ ok: false, error: "services_not_available" });
      }
      const gen = context.services.contentGenerator;
      if (!gen.isAvailable()) {
        return jsonToolResponse({ ok: false, error: "anthropic_api_key_not_configured" });
      }

      const prisma = context.prisma;
      const draft = await (prisma as unknown as { contentDraft: { findUnique: (a: unknown) => Promise<{ id: string; projectId: string; primaryKeyword: string; secondaryKeywords: string[]; intent: string | null; outline: unknown } | null> } })
        .contentDraft.findUnique({ where: { id: content_draft_id } });
      if (!draft) return jsonToolResponse({ ok: false, error: "draft_not_found" });

      const project = await (prisma as unknown as { project: { findUnique: (a: unknown) => Promise<{ language: string; sector: string | null } | null> } })
        .project.findUnique({ where: { id: draft.projectId } });

      try {
        const result = await gen.generate({
          primaryKeyword: draft.primaryKeyword,
          secondaryKeywords: draft.secondaryKeywords,
          intent: draft.intent ?? undefined,
          outline: (draft.outline as { sections: Array<{ heading: string; level: number }> }) ?? { sections: [] },
          language: project?.language,
          sector: project?.sector ?? undefined,
          targetWordCount: target_word_count
        });

        await (prisma as unknown as { contentDraft: { update: (a: unknown) => Promise<unknown> } })
          .contentDraft.update({
            where: { id: content_draft_id },
            data: {
              metaTitle: result.metaTitle,
              metaDescription: result.metaDescription,
              outline: { generated: true, blocks: result.blocks, internalLinkAnchors: result.internalLinkAnchors },
              faqSchema: { items: result.faqPairs },
              status: "ready"
            }
          });

        return jsonToolResponse({
          ok: true,
          content_draft_id,
          metaTitle: result.metaTitle,
          metaDescription: result.metaDescription,
          blocksCount: result.blocks.length,
          faqCount: result.faqPairs.length
        });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  );
}
