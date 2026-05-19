import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

/**
 * StrategyService: turns extracted data into prioritised Opportunities and
 * ChangeRequests.
 *
 * Heuristics (no LLM dependency, deterministic):
 *
 * 1. Keyword opportunities (positions 5-20):
 *    priorityScore = volumeWeight * (21 - position) / 16 * intentMultiplier
 *    Creates Opportunity + ChangeRequest of type "rankmath_optimise_existing_post"
 *    when we can match the keyword to an existing landing page URL.
 *
 * 2. Audit findings:
 *    Creates Opportunities ordered by severity → critical > error > warning.
 *    For specific rule codes we attach a ChangeRequest (e.g. missing meta title
 *    => rankmath_update_metadata).
 *
 * 3. Content gaps:
 *    For each gap with our position null/>50 and competitor position <10,
 *    creates a ContentDraft (status proposed) + ChangeRequest of type
 *    "wordpress_create_post_with_elementor".
 *
 * The service deliberately does NOT call WordPress; it only generates proposals
 * that the Execute service can apply later (after approval).
 */

export interface StrategyResult {
  opportunitiesCreated: number;
  changeRequestsCreated: number;
  contentDraftsCreated: number;
}

const INTENT_MULTIPLIER: Record<string, number> = {
  transactional: 1.5,
  commercial: 1.3,
  informational: 1.0,
  navigational: 0.7
};

export class StrategyService {
  constructor(private prisma: PrismaClient, private logger?: Logger) {}

  async generateForProject(projectId: string): Promise<StrategyResult> {
    const result: StrategyResult = {
      opportunitiesCreated: 0,
      changeRequestsCreated: 0,
      contentDraftsCreated: 0
    };

    // ---- 1. Keyword opportunities ----
    const keywords = await this.prisma.keyword.findMany({
      where: { projectId },
      include: {
        snapshots: { orderBy: { capturedAt: "desc" }, take: 1 }
      }
    });

    for (const kw of keywords) {
      const latest = kw.snapshots[0];
      if (!latest?.position) continue;
      const pos = latest.position;
      if (pos < 5 || pos > 20) continue;

      const volume = kw.searchVolume ?? 0;
      const volumeWeight = Math.log10(1 + volume);
      const intentMult = kw.intent ? INTENT_MULTIPLIER[kw.intent.toLowerCase()] ?? 1.0 : 1.0;
      const priority = volumeWeight * ((21 - pos) / 16) * intentMult;

      const opp = await this.prisma.opportunity.create({
        data: {
          projectId,
          source: "seranking",
          keyword: kw.keyword,
          opportunityType: "keyword_optimization",
          currentPosition: pos,
          previousPosition: latest.previousPosition ?? null,
          searchVolume: kw.searchVolume,
          intent: kw.intent,
          priorityScore: priority,
          summary: `Mejorar posición ${pos} → top 5 para "${kw.keyword}" (vol ${volume})`,
          recommendedAction: "Optimizar meta y contenido del landing page actual",
          url: latest.url ?? undefined
        }
      });
      result.opportunitiesCreated += 1;

      if (latest.url) {
        await this.prisma.changeRequest.create({
          data: {
            projectId,
            opportunityId: opp.id,
            url: latest.url,
            targetEntityType: "rankmath_post",
            changeType: "rankmath_optimise_existing_post",
            riskLevel: "low",
            status: "proposed",
            afterPayload: {
              focusKeyword: kw.keyword,
              suggestion: "Update metaTitle and metaDescription to feature primary keyword and intent verb."
            },
            reason: `Keyword "${kw.keyword}" in position ${pos}, opportunity to climb to top 5.`,
            expectedImpact: `Estimated organic traffic uplift of ${Math.round(volume * 0.1)} clicks/mo if we hit top 5.`
          }
        });
        result.changeRequestsCreated += 1;
      }
    }

    // ---- 2. Audit findings ----
    const audits = await this.prisma.auditFinding.findMany({
      where: { projectId, resolvedAt: null },
      orderBy: { severity: "desc" }
    });

    for (const audit of audits) {
      const severityScore: Record<string, number> = {
        critical: 10, error: 7, warning: 4, notice: 2, info: 1
      };
      const opp = await this.prisma.opportunity.create({
        data: {
          projectId,
          source: "seranking_audit",
          opportunityType: "technical_seo_fix",
          url: audit.url ?? undefined,
          priorityScore: severityScore[audit.severity] ?? 1,
          summary: `[${audit.severity.toUpperCase()}] ${audit.message}`,
          recommendedAction: mapAuditRuleToAction(audit.ruleCode)
        }
      });
      result.opportunitiesCreated += 1;

      const changeType = mapAuditRuleToChangeType(audit.ruleCode);
      if (changeType && audit.url) {
        await this.prisma.changeRequest.create({
          data: {
            projectId,
            opportunityId: opp.id,
            url: audit.url,
            targetEntityType: "rankmath_post",
            changeType,
            riskLevel: audit.severity === "critical" ? "high" : "medium",
            status: "proposed",
            afterPayload: { rule: audit.ruleCode, details: audit.details ?? {} },
            reason: `Audit rule ${audit.ruleCode}: ${audit.message}`,
            expectedImpact: `Resolves ${audit.severity}-severity technical SEO issue.`
          }
        });
        result.changeRequestsCreated += 1;
      }
    }

    // ---- 3. Content gaps → ContentDraft + ChangeRequest ----
    const gaps = await this.prisma.contentGap.findMany({
      where: { projectId, ourPosition: null }
    });

    for (const gap of gaps) {
      const draft = await this.prisma.contentDraft.create({
        data: {
          projectId,
          topic: gap.keyword,
          primaryKeyword: gap.keyword,
          secondaryKeywords: [],
          status: "proposed",
          outline: {
            sections: [
              { heading: gap.keyword, level: 1 },
              { heading: "Introducción", level: 2 },
              { heading: "Beneficios principales", level: 2 },
              { heading: "Cómo funciona", level: 2 },
              { heading: "Preguntas frecuentes", level: 2 }
            ]
          }
        }
      });
      const cr = await this.prisma.changeRequest.create({
        data: {
          projectId,
          targetEntityType: "wp_post",
          changeType: "wordpress_create_post_with_elementor",
          riskLevel: "medium",
          status: "proposed",
          afterPayload: {
            contentDraftId: draft.id,
            primaryKeyword: gap.keyword,
            searchVolume: gap.searchVolume,
            difficulty: gap.difficulty
          },
          reason: `Content gap: competitor ranks for "${gap.keyword}" (vol ${gap.searchVolume ?? "?"}), we don't.`,
          expectedImpact: `Capture new long-tail traffic; ~${Math.round((gap.searchVolume ?? 0) * 0.05)} clicks/mo if we reach top 10.`
        }
      });
      await this.prisma.contentDraft.update({
        where: { id: draft.id },
        data: { changeRequestId: cr.id }
      });
      result.contentDraftsCreated += 1;
      result.changeRequestsCreated += 1;
    }

    this.logger?.info({ projectId, result }, "Strategy generation complete");
    return result;
  }

  async generateForAllActiveProjects(): Promise<Array<{ projectId: string; result: StrategyResult }>> {
    const projects = await this.prisma.project.findMany({
      where: { status: "active" },
      select: { id: true }
    });
    const out: Array<{ projectId: string; result: StrategyResult }> = [];
    for (const p of projects) {
      out.push({ projectId: p.id, result: await this.generateForProject(p.id) });
    }
    return out;
  }
}

function mapAuditRuleToAction(rule: string): string {
  const r = rule.toLowerCase();
  if (r.includes("title")) return "Añadir/optimizar meta title para incluir keyword principal.";
  if (r.includes("description")) return "Redactar meta description con CTA y keyword.";
  if (r.includes("h1")) return "Asegurar un único H1 con la keyword principal.";
  if (r.includes("alt")) return "Añadir atributos alt descriptivos a imágenes.";
  if (r.includes("canonical")) return "Establecer canonical URL correcta.";
  if (r.includes("robots")) return "Revisar meta robots y robots.txt.";
  if (r.includes("redirect")) return "Crear redirección 301 desde la URL antigua.";
  if (r.includes("speed") || r.includes("performance")) return "Mejorar Core Web Vitals (LCP, CLS, INP).";
  return "Revisar y aplicar fix técnico SEO.";
}

function mapAuditRuleToChangeType(rule: string): string | null {
  const r = rule.toLowerCase();
  if (r.includes("title") || r.includes("description") || r.includes("focus")) return "rankmath_update_metadata";
  if (r.includes("canonical")) return "rankmath_update_canonical";
  if (r.includes("robots")) return "rankmath_update_robots";
  if (r.includes("redirect")) return "rankmath_create_redirection";
  return null;
}
