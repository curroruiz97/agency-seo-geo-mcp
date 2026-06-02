import { HttpClient } from "./http.js";
import type { Logger } from "pino";

const PROJECT_RATE_LIMIT_PER_MIN = 240;
const DATA_RATE_LIMIT_PER_MIN = 480;

export interface SerankingProjectSummary {
  id: number; title: string; name: string; groupId?: number; isActive?: boolean; checkFreq?: string;
}
export interface SerankingSearchEngine {
  id: number; searchEngine: string; region?: string; language?: string; device?: string; isActive?: boolean;
}
export interface SerankingKeyword {
  id: string; name: string; groupId?: string; link?: string | null; firstCheckDate?: string | null; tags?: string[];
}
export interface SerankingPositionEntry {
  date: string; pos: number | null; change?: number | null; isMap?: boolean;
  mapPosition?: number | null; paidPosition?: number | null;
  landingPages?: Array<{ url: string; date: string }>;
  serpFeatures?: Record<string, boolean>;
  volume?: number; competition?: number;
}
export interface SerankingPositionGroup {
  siteEngineId: number;
  keywords: Array<{ id: string; name: string; positions: SerankingPositionEntry[] }>;
}
export interface SerankingCompetitor {
  id: number; name: string; url: string; domainTrust?: number;
}
export interface SerankingAuditIssue {
  code: string; severity: "error" | "warning" | "notice" | "info"; category: string;
  message: string; affectedUrl?: string; snippet?: unknown; metric?: Record<string, unknown>;
}
export interface SerankingAuditReport {
  auditId: number; scorePercent?: number; totalPages?: number; totalErrors?: number;
  totalWarnings?: number; totalNotices?: number;
  sections: Array<{ section: string; issues: SerankingAuditIssue[] }>;
}

export class SerankingClientError extends Error {
  constructor(public code: number, public description: string, public original?: unknown) {
    super(`SE Ranking error ${code}: ${description}`);
    this.name = "SerankingClientError";
  }
}

function parseErrorEnvelope(err: unknown): SerankingClientError | null {
  if (err && typeof err === "object" && "body" in err) {
    try {
      const parsed = JSON.parse((err as { body: string }).body);
      if (parsed?.error?.description) {
        return new SerankingClientError(Number(parsed.error.code ?? 0), String(parsed.error.description), err);
      }
    } catch { /* ignore */ }
  }
  return null;
}

function asArray(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

export interface SerankingProjectClientOptions {
  apiKey: string; baseUrl?: string; logger?: Logger;
}

export class SerankingProjectClient {
  private http: HttpClient;
  constructor(opts: SerankingProjectClientOptions) {
    this.http = new HttpClient({
      baseUrl: opts.baseUrl ?? "https://api4.seranking.com",
      defaultHeaders: { Authorization: `Token ${opts.apiKey}` },
      rateLimitPerMinute: PROJECT_RATE_LIMIT_PER_MIN,
      logger: opts.logger
    });
  }
  async listSites(): Promise<SerankingProjectSummary[]> {
    const raw = await this.call<unknown>("GET", "/sites");
    return asArray(raw).map((it) => {
      const o = it as Record<string, unknown>;
      return {
        id: Number(o["id"]),
        title: String(o["title"] ?? ""),
        name: String(o["name"] ?? ""),
        groupId: typeof o["group_id"] === "number" ? (o["group_id"] as number) : undefined,
        isActive: o["is_active"] === 1 || o["is_active"] === true,
        checkFreq: typeof o["check_freq"] === "string" ? (o["check_freq"] as string) : undefined
      };
    });
  }
  async listSearchEngines(siteId: number): Promise<SerankingSearchEngine[]> {
    const raw = await this.call<unknown>("GET", `/sites/${siteId}/search-engines`);
    return asArray(raw).map((it) => {
      const o = it as Record<string, unknown>;
      return {
        id: Number(o["id"]),
        searchEngine: String(o["search_engine"] ?? o["engine"] ?? ""),
        region: typeof o["region"] === "string" ? (o["region"] as string) : undefined,
        language: typeof o["language"] === "string" ? (o["language"] as string) : undefined,
        device: typeof o["device"] === "string" ? (o["device"] as string) : undefined,
        isActive: o["is_active"] === 1 || o["is_active"] === true
      };
    });
  }
  async listKeywords(siteId: number, siteEngineId: number): Promise<SerankingKeyword[]> {
    const raw = await this.call<unknown>("GET", `/sites/${siteId}/keywords`, { query: { site_engine_id: siteEngineId } });
    return asArray(raw).map((it) => {
      const o = it as Record<string, unknown>;
      return {
        id: String(o["id"] ?? ""),
        name: String(o["name"] ?? ""),
        groupId: o["group_id"] !== undefined && o["group_id"] !== null ? String(o["group_id"]) : undefined,
        link: o["link"] as string | null | undefined,
        firstCheckDate: (o["first_check_date"] as string | null | undefined) ?? null,
        tags: Array.isArray(o["tags"]) ? (o["tags"] as string[]) : []
      };
    });
  }
  async getPositions(siteId: number, opts?: { siteEngineId?: number; dateFrom?: string; dateTo?: string; withLandingPages?: boolean; withSerpFeatures?: boolean; }): Promise<SerankingPositionGroup[]> {
    const today = new Date().toISOString().slice(0, 10);
    const raw = await this.call<unknown>("GET", `/sites/${siteId}/positions`, {
      query: {
        site_engine_id: opts?.siteEngineId,
        date_from: opts?.dateFrom ?? today,
        date_to: opts?.dateTo ?? today,
        with_landing_pages: opts?.withLandingPages ? 1 : undefined,
        with_serp_features: opts?.withSerpFeatures ? 1 : undefined
      }
    });
    return asArray(raw).map((it) => {
      const o = it as Record<string, unknown>;
      return {
        siteEngineId: Number(o["site_engine_id"] ?? o["siteEngineId"] ?? 0),
        keywords: asArray(o["keywords"]).map((k) => {
          const kw = k as Record<string, unknown>;
          return {
            id: String(kw["id"] ?? ""),
            name: String(kw["name"] ?? ""),
            positions: asArray(kw["positions"]).map((p) => {
              const pe = p as Record<string, unknown>;
              return {
                date: String(pe["date"] ?? ""),
                pos: pe["pos"] === null ? null : Number(pe["pos"] ?? 0),
                change: pe["change"] !== undefined ? Number(pe["change"]) : null,
                isMap: Boolean(pe["is_map"]),
                mapPosition: pe["map_position"] !== undefined ? Number(pe["map_position"]) : null,
                paidPosition: pe["paid_position"] !== undefined ? Number(pe["paid_position"]) : null,
                landingPages: Array.isArray(pe["landing_pages"]) ? (pe["landing_pages"] as Array<{ url: string; date: string }>) : undefined,
                serpFeatures: typeof pe["serp_features"] === "object" ? (pe["serp_features"] as Record<string, boolean>) : undefined,
                volume: typeof pe["volume"] === "number" ? (pe["volume"] as number) : undefined,
                competition: typeof pe["competition"] === "number" ? (pe["competition"] as number) : undefined
              };
            })
          };
        })
      };
    });
  }
  async listCompetitors(siteId: number): Promise<SerankingCompetitor[]> {
    const raw = await this.call<unknown>("GET", `/sites/${siteId}/competitors`);
    return asArray(raw).map((it) => {
      const o = it as Record<string, unknown>;
      return {
        id: Number(o["id"]),
        name: String(o["name"] ?? o["url"] ?? ""),
        url: String(o["url"] ?? ""),
        domainTrust: typeof o["domain_trust"] === "number" ? (o["domain_trust"] as number) : undefined
      };
    });
  }
  async listBacklinks(siteId: number): Promise<unknown[]> {
    const raw = await this.call<unknown>("GET", `/backlinks/${siteId}`);
    return asArray(raw);
  }
  private async call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown }): Promise<T> {
    try { return await this.http.request<T>(method, path, opts); }
    catch (err) { const wrapped = parseErrorEnvelope(err); if (wrapped) throw wrapped; throw err; }
  }
}

export interface SerankingDataClientOptions {
  apiKey: string; baseUrl?: string; logger?: Logger;
}

export class SerankingDataClient {
  private http: HttpClient;
  constructor(opts: SerankingDataClientOptions) {
    this.http = new HttpClient({
      baseUrl: opts.baseUrl ?? "https://api.seranking.com/v1",
      defaultHeaders: { Authorization: `Token ${opts.apiKey}` },
      rateLimitPerMinute: DATA_RATE_LIMIT_PER_MIN,
      logger: opts.logger
    });
  }
  async listAudits(): Promise<Array<{ id: number; url: string; status: string }>> {
    const raw = await this.call<unknown>("GET", "/site-audit/audits");
    return asArray(raw).map((it) => {
      const o = it as Record<string, unknown>;
      return { id: Number(o["id"]), url: String(o["url"] ?? ""), status: String(o["status"] ?? "") };
    });
  }
  async getAuditStatus(auditId: number): Promise<{ status: string; progress?: number }> {
    const raw = await this.call<Record<string, unknown>>("GET", "/site-audit/audits/status", { query: { audit_id: auditId } });
    return {
      status: String(raw["status"] ?? ""),
      progress: typeof raw["progress"] === "number" ? (raw["progress"] as number) : undefined
    };
  }
  async getAuditReport(auditId: number): Promise<SerankingAuditReport> {
    const raw = await this.call<Record<string, unknown>>("GET", "/site-audit/audits/report", { query: { audit_id: auditId } });
    const sections = asArray(raw["sections"]).map((s) => {
      const sec = s as Record<string, unknown>;
      return {
        section: String(sec["name"] ?? sec["section"] ?? "general"),
        issues: asArray(sec["checks"] ?? sec["issues"]).map(normaliseIssue)
      };
    });
    return {
      auditId,
      scorePercent: typeof raw["score_percent"] === "number" ? (raw["score_percent"] as number) : undefined,
      totalPages: typeof raw["total_pages"] === "number" ? (raw["total_pages"] as number) : undefined,
      totalErrors: typeof raw["total_errors"] === "number" ? (raw["total_errors"] as number) : undefined,
      totalWarnings: typeof raw["total_warnings"] === "number" ? (raw["total_warnings"] as number) : undefined,
      totalNotices: typeof raw["total_notices"] === "number" ? (raw["total_notices"] as number) : undefined,
      sections
    };
  }
  async getPageIssues(auditId: number, urlId: number): Promise<SerankingAuditIssue[]> {
    const raw = await this.call<Record<string, unknown>>("GET", "/site-audit/audits/issues", { query: { audit_id: auditId, url_id: urlId } });
    return asArray(raw["issues"]).map(normaliseIssue);
  }
  private async call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown }): Promise<T> {
    try { return await this.http.request<T>(method, path, opts); }
    catch (err) { const wrapped = parseErrorEnvelope(err); if (wrapped) throw wrapped; throw err; }
  }
}

function normaliseIssue(raw: unknown): SerankingAuditIssue {
  const o = (raw as Record<string, unknown>) ?? {};
  const sevRaw = String(o["severity"] ?? o["level"] ?? "warning").toLowerCase();
  const sev: SerankingAuditIssue["severity"] =
    sevRaw === "error" || sevRaw === "critical" ? "error"
    : sevRaw === "warning" ? "warning"
    : sevRaw === "notice" ? "notice"
    : "info";
  return {
    code: String(o["code"] ?? o["rule_code"] ?? "unknown"),
    severity: sev,
    category: String(o["category"] ?? o["group"] ?? "general"),
    message: String(o["message"] ?? o["title"] ?? o["name"] ?? "Untitled issue"),
    affectedUrl: typeof o["url"] === "string" ? (o["url"] as string) : undefined,
    snippet: o["snippet"],
    metric: typeof o["metric"] === "object" ? (o["metric"] as Record<string, unknown>) : undefined
  };
}

// -----------------------------------------------------------------------------
// Unified SerankingClient — single facade that auto-detects key type, instantiates
// the right sub-client(s), and routes calls. Keep SerankingProjectClient and
// SerankingDataClient exported for backwards compat.
// -----------------------------------------------------------------------------

export type SerankingKeyType = "project" | "data" | "unknown";

export interface SerankingKeyClassification {
  apiKey: string;
  keyType: SerankingKeyType;
  format: "uuid" | "hex40" | "other";
  capabilities: string[];
  probe: { project: { ok: boolean; status?: number; error?: string }; data: { ok: boolean; status?: number; error?: string } };
}

export interface SerankingClientOptions {
  projectKey?: string;
  dataKey?: string;
  logger?: Logger;
}

export class SerankingClient {
  private project?: SerankingProjectClient;
  private data?: SerankingDataClient;
  private logger?: Logger;

  constructor(opts: SerankingClientOptions) {
    this.logger = opts.logger;
    if (opts.projectKey) this.project = new SerankingProjectClient({ apiKey: opts.projectKey, logger: opts.logger });
    if (opts.dataKey) this.data = new SerankingDataClient({ apiKey: opts.dataKey, logger: opts.logger });
  }

  hasProject(): boolean { return !!this.project; }
  hasData(): boolean { return !!this.data; }

  private requireProject(): SerankingProjectClient {
    if (!this.project) throw new SerankingClientError(401, "Project API key is not configured for this operation.");
    return this.project;
  }
  private requireData(): SerankingDataClient {
    if (!this.data) throw new SerankingClientError(401, "Data API key is not configured for this operation.");
    return this.data;
  }

  // ---- Project API surface ----
  listSites() { return this.requireProject().listSites(); }
  listSearchEngines(siteId: number) { return this.requireProject().listSearchEngines(siteId); }
  listKeywords(siteId: number, siteEngineId: number) { return this.requireProject().listKeywords(siteId, siteEngineId); }
  getPositions(siteId: number, opts?: Parameters<SerankingProjectClient["getPositions"]>[1]) { return this.requireProject().getPositions(siteId, opts); }
  listCompetitors(siteId: number) { return this.requireProject().listCompetitors(siteId); }
  listBacklinks(siteId: number) { return this.requireProject().listBacklinks(siteId); }

  // ---- Data API surface ----
  listAudits() { return this.requireData().listAudits(); }
  getAuditStatus(auditId: number) { return this.requireData().getAuditStatus(auditId); }
  getAuditReport(auditId: number) { return this.requireData().getAuditReport(auditId); }
  getPageIssues(auditId: number, urlId: number) { return this.requireData().getPageIssues(auditId, urlId); }

  /**
   * Probe a raw API key against both SE Ranking APIs and classify it.
   *
   * Project API:  GET https://api4.seranking.com/sites
   * Data API:     GET https://api.seranking.com/v1/site-audit/audits
   *
   * Returns the format (uuid / 40-char hex), which API accepted the key,
   * and a flat list of high-level capabilities the caller can rely on.
   */
  static async detectKey(apiKey: string, logger?: Logger): Promise<SerankingKeyClassification> {
    const trimmed = apiKey.trim();
    const format: SerankingKeyClassification["format"] =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? "uuid"
      : /^[0-9a-f]{40}$/i.test(trimmed) ? "hex40"
      : "other";

    const probeProject = await probeEndpoint("https://api4.seranking.com/sites", trimmed);
    const probeData = await probeEndpoint("https://api.seranking.com/v1/site-audit/audits", trimmed);

    let keyType: SerankingKeyType = "unknown";
    const caps: string[] = [];
    if (probeProject.ok) { keyType = "project"; caps.push("sites", "keywords", "positions", "competitors", "backlinks"); }
    if (probeData.ok)    { keyType = probeProject.ok ? keyType : "data"; caps.push("audits", "site_audit_report", "page_issues"); }

    logger?.info({ format, keyType, probeProject, probeData }, "SE Ranking key detection");
    return { apiKey: trimmed, keyType, format, capabilities: caps, probe: { project: probeProject, data: probeData } };
  }
}

async function probeEndpoint(url: string, apiKey: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, { method: "GET", headers: { Authorization: `Token ${apiKey}` } });
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
