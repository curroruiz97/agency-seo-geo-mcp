import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { type SerankingPositionEntry } from "../clients/seranking.js";
import { CredentialsService } from "./credentials.js";

type ExtractionRun = {
  id: string; projectId: string; status: string;
  startedAt: Date; finishedAt: Date | null;
  stats: unknown; errorMessage: string | null;
};

export interface ExtractStats {
  searchEngines: number;
  keywords: number;
  positions: number;
  auditFindings: number;
  competitors: number;
  durationMs?: number;
  notes?: string[];
}

export class ExtractService {
  constructor(private prisma: PrismaClient, private credentials: CredentialsService, private logger?: Logger) {}

  async runForProject(projectId: string): Promise<{ run: ExtractionRun; stats: ExtractStats }> {
    const p: any = this.prisma as any;
    const project = await p.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!project.serankingProjectId) throw new Error(`Project ${projectId} has no serankingProjectId.`);

    const seranking = await this.credentials.buildSerankingClient(projectId);
    if (!seranking.hasProject()) {
      throw new Error("SE Ranking Project API key is not configured (global or per-project). Register one with register_seranking_key.");
    }

    const run = await p.extractionRun.create({ data: { projectId, source: "seranking", status: "running" } });
    const startTime = Date.now();
    const stats: ExtractStats = { searchEngines: 0, keywords: 0, positions: 0, auditFindings: 0, competitors: 0, notes: [] };

    try {
      const remoteSiteId = Number(project.serankingProjectId);
      if (!Number.isFinite(remoteSiteId)) throw new Error(`serankingProjectId must be numeric, got "${project.serankingProjectId}"`);

      const engines = await seranking.listSearchEngines(remoteSiteId);
      stats.searchEngines = engines.length;
      if (engines.length === 0) stats.notes!.push("No search engines configured on SE Ranking project.");

      for (const engine of engines) {
        const remoteKeywords = await seranking.listKeywords(remoteSiteId, engine.id);
        for (const kw of remoteKeywords) {
          await p.keyword.upsert({
            where: { projectId_keyword: { projectId, keyword: kw.name } },
            create: {
              projectId, keyword: kw.name, serankingId: kw.id || null, groupName: kw.groupId,
              country: engine.region, language: engine.language
            },
            update: {
              serankingId: kw.id || null, groupName: kw.groupId,
              country: engine.region, language: engine.language, lastSeenAt: new Date()
            }
          });
          stats.keywords += 1;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      for (const engine of engines) {
        const groups = await seranking.getPositions(remoteSiteId, {
          siteEngineId: engine.id, dateFrom: today, dateTo: today,
          withLandingPages: true, withSerpFeatures: true
        });
        for (const group of groups) {
          for (const kw of group.keywords) {
            const latest = pickLatest(kw.positions);
            if (!latest) continue;
            const keywordRow = await p.keyword.findUnique({
              where: { projectId_keyword: { projectId, keyword: kw.name } }
            });
            if (!keywordRow) continue;
            const pos = latest.pos;
            const prev = typeof latest.change === "number" && pos !== null ? pos + latest.change : null;
            const landingUrl = latest.landingPages?.[0]?.url;
            await p.keywordSnapshot.create({
              data: {
                keywordId: keywordRow.id,
                position: pos, previousPosition: prev,
                url: landingUrl, device: engine.device, location: engine.region,
                changeVsPrevious: typeof latest.change === "number" ? latest.change : null,
                inTop3: pos !== null && pos > 0 && pos <= 3,
                inTop10: pos !== null && pos > 0 && pos <= 10,
                inOpportunityWindow: pos !== null && pos >= 5 && pos <= 20
              }
            });
            stats.positions += 1;
          }
        }
      }

      const competitors = await seranking.listCompetitors(remoteSiteId);
      for (const c of competitors) {
        const domain = normaliseDomain(c.url);
        await p.competitor.upsert({
          where: { projectId_domain: { projectId, domain } },
          create: {
            projectId, domain,
            visibilityScore: typeof c.domainTrust === "number" ? c.domainTrust : null
          },
          update: {
            visibilityScore: typeof c.domainTrust === "number" ? c.domainTrust : null,
            lastSeenAt: new Date()
          }
        });
        stats.competitors += 1;
      }

      if (seranking.hasData()) {
        try {
          const audits = await seranking.listAudits();
          const audit = audits.find((a) => a.url.includes(project.domain)) ?? audits[0];
          if (audit) {
            const report = await seranking.getAuditReport(audit.id);
            for (const section of report.sections) {
              for (const issue of section.issues) {
                await p.auditFinding.upsert({
                  where: {
                    projectId_ruleCode_url: { projectId, ruleCode: issue.code, url: issue.affectedUrl ?? "" }
                  },
                  create: {
                    projectId, ruleCode: issue.code,
                    category: issue.category || section.section,
                    severity: issue.severity, url: issue.affectedUrl,
                    message: issue.message,
                    details: (issue.snippet as object) ?? {}
                  },
                  update: {
                    category: issue.category || section.section,
                    severity: issue.severity, message: issue.message,
                    details: (issue.snippet as object) ?? {},
                    lastSeenAt: new Date(), resolvedAt: null
                  }
                });
                stats.auditFindings += 1;
              }
            }
          } else {
            stats.notes!.push("No audit found via Data API for this domain.");
          }
        } catch (err) {
          stats.notes!.push(`Audit pull failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        stats.notes!.push("Data API key not configured; site audit skipped.");
      }

      stats.durationMs = Date.now() - startTime;
      const finished = await p.extractionRun.update({
        where: { id: run.id },
        data: { status: "completed", finishedAt: new Date(), stats }
      });
      this.logger?.info({ projectId, stats }, "Extract run completed");
      return { run: finished, stats };
    } catch (err) {
      await p.extractionRun.update({
        where: { id: run.id },
        data: {
          status: "failed", finishedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err)
        }
      });
      this.logger?.error({ projectId, err: String(err) }, "Extract run failed");
      throw err;
    }
  }

  async runForAllActiveProjects(): Promise<Array<{ projectId: string; ok: boolean; stats?: ExtractStats; error?: string }>> {
    const p: any = this.prisma as any;
    const projects = await p.project.findMany({
      where: { status: "active", serankingProjectId: { not: null }, domain: { not: "__global__" } },
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

function pickLatest(positions: SerankingPositionEntry[]): SerankingPositionEntry | undefined {
  if (!positions || positions.length === 0) return undefined;
  return positions.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
}

function normaliseDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  }
}
