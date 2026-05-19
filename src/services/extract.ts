import type { PrismaClient } from "@prisma/client";
type ExtractionRun = { id: string; projectId: string; status: string; startedAt: Date; finishedAt: Date | null; stats: unknown; errorMessage: string | null };
import type { Logger } from "pino";
import { SerankingClient } from "../clients/seranking.js";
import { CredentialsService } from "./credentials.js";

/**
 * ExtractService: pulls SEO data from SE Ranking for a project and upserts
 * it into our DB. Idempotent: re-running for the same project updates rows
 * in place and records a new ExtractionRun.
 */

export interface ExtractStats {
  keywords: number;
  positions: number;
  auditFindings: number;
  competitors: number;
}

export class ExtractService {
  constructor(
    private prisma: PrismaClient,
    private credentials: CredentialsService,
    private logger?: Logger
  ) {}

  async runForProject(projectId: string): Promise<{ run: ExtractionRun; stats: ExtractStats }> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!project.serankingProjectId) {
      throw new Error(`Project ${projectId} has no serankingProjectId; nothing to extract.`);
    }

    const credsPayload = await this.credentials.getSeranking(projectId);
    if (!credsPayload?.apiKey) {
      throw new Error("SE Ranking API key is not configured (global or per-project).");
    }

    const run = await this.prisma.extractionRun.create({
      data: { projectId, source: "seranking", status: "running" }
    });
    const startTime = Date.now();

    const client = new SerankingClient({ apiKey: credsPayload.apiKey, logger: this.logger });

    const stats: ExtractStats = { keywords: 0, positions: 0, auditFindings: 0, competitors: 0 };

    try {
      // 1. Keywords (catalog)
      const remoteKeywords = await client.listKeywords(project.serankingProjectId);
      for (const kw of remoteKeywords) {
        await this.prisma.keyword.upsert({
          where: { projectId_keyword: { projectId, keyword: kw.keyword } },
          create: {
            projectId,
            keyword: kw.keyword,
            searchVolume: kw.searchVolume,
            difficulty: kw.difficulty,
            cpc: kw.cpc !== undefined ? (kw.cpc as unknown as number) : null,
            intent: kw.intent,
            serankingId: kw.id || null,
            groupName: kw.groupName
          },
          update: {
            searchVolume: kw.searchVolume,
            difficulty: kw.difficulty,
            cpc: kw.cpc !== undefined ? (kw.cpc as unknown as number) : null,
            intent: kw.intent,
            serankingId: kw.id || null,
            groupName: kw.groupName,
            lastSeenAt: new Date()
          }
        });
        stats.keywords += 1;
      }

      // 2. Current positions (snapshot)
      const positions = await client.getCurrentPositions(project.serankingProjectId);
      for (const p of positions) {
        const keyword = await this.prisma.keyword.findUnique({
          where: { projectId_keyword: { projectId, keyword: p.keyword } }
        });
        if (!keyword) continue;
        const pos = p.position ?? null;
        const prev = p.previousPosition ?? null;
        await this.prisma.keywordSnapshot.create({
          data: {
            keywordId: keyword.id,
            position: pos,
            previousPosition: prev,
            url: p.url,
            device: p.device,
            location: p.searchEngine,
            changeVsPrevious: pos !== null && prev !== null ? prev - pos : null,
            inTop3: pos !== null && pos > 0 && pos <= 3,
            inTop10: pos !== null && pos > 0 && pos <= 10,
            inOpportunityWindow: pos !== null && pos >= 5 && pos <= 20
          }
        });
        stats.positions += 1;
      }

      // 3. Audit findings
      const issues = await client.getAuditIssues(project.serankingProjectId);
      for (const issue of issues) {
        await this.prisma.auditFinding.upsert({
          where: {
            projectId_ruleCode_url: {
              projectId,
              ruleCode: issue.ruleCode,
              url: issue.affectedUrl ?? ""
            }
          },
          create: {
            projectId,
            ruleCode: issue.ruleCode,
            category: issue.category,
            severity: issue.severity,
            url: issue.affectedUrl,
            message: issue.message,
            details: issue.details ?? {}
          },
          update: {
            category: issue.category,
            severity: issue.severity,
            message: issue.message,
            details: issue.details ?? {},
            lastSeenAt: new Date(),
            resolvedAt: null
          }
        });
        stats.auditFindings += 1;
      }

      // 4. Competitors
      const competitors = await client.getCompetitors(project.serankingProjectId);
      for (const c of competitors) {
        await this.prisma.competitor.upsert({
          where: { projectId_domain: { projectId, domain: c.domain } },
          create: {
            projectId,
            domain: c.domain,
            visibilityScore: c.visibilityScore ?? null,
            sharedKeywords: c.sharedKeywords,
            exclusiveKeywords: c.exclusiveKeywords
          },
          update: {
            visibilityScore: c.visibilityScore ?? null,
            sharedKeywords: c.sharedKeywords,
            exclusiveKeywords: c.exclusiveKeywords,
            lastSeenAt: new Date()
          }
        });
        stats.competitors += 1;
      }

      const finished = await this.prisma.extractionRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          stats: { ...stats, durationMs: Date.now() - startTime }
        }
      });
      this.logger?.info({ projectId, stats }, "Extract run completed");
      return { run: finished, stats };
    } catch (err) {
      await this.prisma.extractionRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err)
        }
      });
      this.logger?.error({ projectId, err: String(err) }, "Extract run failed");
      throw err;
    }
  }

  /**
   * Run extract for all active projects, in serial to respect rate limits.
   * Returns array of per-project results (success or error).
   */
  async runForAllActiveProjects(): Promise<Array<{ projectId: string; ok: boolean; stats?: ExtractStats; error?: string }>> {
    const projects = await this.prisma.project.findMany({
      where: { status: "active", serankingProjectId: { not: null } },
      select: { id: true, name: true }
    });
    const results: Array<{ projectId: string; ok: boolean; stats?: ExtractStats; error?: string }> = [];
    for (const project of projects) {
      try {
        const { stats } = await this.runForProject(project.id);
        results.push({ projectId: project.id, ok: true, stats });
      } catch (err) {
        results.push({ projectId: project.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  }
}
