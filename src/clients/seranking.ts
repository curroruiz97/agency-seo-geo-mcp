import { HttpClient } from "./http.js";
import type { Logger } from "pino";

/**
 * SE Ranking API v1 client.
 * Docs: https://seranking.com/api.html
 * Auth: bearer token (Api-Key header).
 *
 * Endpoints used:
 * - GET /sites                                    → list projects
 * - GET /sites/{siteId}/positions                 → keyword rankings (current)
 * - GET /sites/{siteId}/keywords                  → tracked keywords with volume/difficulty
 * - GET /sites/{siteId}/audit/issues              → site audit findings
 * - GET /sites/{siteId}/competitors               → competitor research
 * - GET /sites/{siteId}/backlinks                 → backlinks
 *
 * NB: endpoint paths follow SE Ranking's public API. If the user's plan exposes
 * a slightly different shape we centralise the mapping here.
 */

export interface SerankingProjectSummary {
  id: string;
  name: string;
  domain: string;
  searchEngine?: string;
  language?: string;
  location?: string;
  groupName?: string;
}

export interface SerankingKeyword {
  id: string;
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  intent?: string;
  groupName?: string;
}

export interface SerankingPosition {
  keywordId: string;
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  url?: string;
  date: string;
  device?: string;
  searchEngine?: string;
}

export interface SerankingAuditIssue {
  ruleCode: string;
  category: string;
  severity: "info" | "notice" | "warning" | "error" | "critical";
  message: string;
  affectedUrl?: string;
  details?: Record<string, unknown>;
}

export interface SerankingCompetitor {
  domain: string;
  visibilityScore?: number;
  sharedKeywords?: number;
  exclusiveKeywords?: number;
}

export interface SerankingClientOptions {
  apiKey: string;
  baseUrl?: string;
  logger?: Logger;
  rateLimitPerMinute?: number;
}

export class SerankingClient {
  private http: HttpClient;

  constructor(opts: SerankingClientOptions) {
    this.http = new HttpClient({
      baseUrl: opts.baseUrl ?? "https://api4.seranking.com",
      defaultHeaders: { Authorization: `Token ${opts.apiKey}` },
      rateLimitPerMinute: opts.rateLimitPerMinute ?? 120,
      logger: opts.logger
    });
  }

  async listProjects(): Promise<SerankingProjectSummary[]> {
    const raw = await this.http.request<unknown>("GET", "/sites");
    return normalizeProjects(raw);
  }

  async listKeywords(siteId: string): Promise<SerankingKeyword[]> {
    const raw = await this.http.request<unknown>("GET", `/sites/${siteId}/keywords`);
    return normalizeKeywords(raw);
  }

  async getCurrentPositions(siteId: string, opts?: { date?: string; device?: string }): Promise<SerankingPosition[]> {
    const raw = await this.http.request<unknown>(
      "GET",
      `/sites/${siteId}/positions`,
      { query: { date: opts?.date, device: opts?.device } }
    );
    return normalizePositions(raw);
  }

  async getAuditIssues(siteId: string): Promise<SerankingAuditIssue[]> {
    const raw = await this.http.request<unknown>("GET", `/sites/${siteId}/audit/issues`);
    return normalizeAuditIssues(raw);
  }

  async getCompetitors(siteId: string): Promise<SerankingCompetitor[]> {
    const raw = await this.http.request<unknown>("GET", `/sites/${siteId}/competitors`);
    return normalizeCompetitors(raw);
  }

  async getBacklinks(siteId: string, opts?: { limit?: number }): Promise<unknown[]> {
    const raw = await this.http.request<unknown>(
      "GET",
      `/sites/${siteId}/backlinks`,
      { query: { limit: opts?.limit ?? 100 } }
    );
    return Array.isArray(raw) ? raw : asArray((raw as { data?: unknown[] })?.data);
  }
}

// ---------- normalisers ----------
// SE Ranking response shapes vary by endpoint version; we defensively read
// camelCase, snake_case and nested data envelopes.

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function getStr(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function getInt(o: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function normalizeProjects(raw: unknown): SerankingProjectSummary[] {
  const list = Array.isArray(raw) ? raw : asArray((raw as { sites?: unknown[]; data?: unknown[] })?.sites ?? (raw as { data?: unknown[] })?.data);
  return list.map((it) => {
    const o = (it as Record<string, unknown>) ?? {};
    return {
      id: String(getStr(o, "id", "site_id", "siteId") ?? ""),
      name: String(getStr(o, "name", "title", "project_name") ?? ""),
      domain: String(getStr(o, "domain", "url", "site_url") ?? ""),
      searchEngine: getStr(o, "search_engine", "searchEngine"),
      language: getStr(o, "language", "lang"),
      location: getStr(o, "location", "country"),
      groupName: getStr(o, "group", "group_name", "groupName")
    };
  }).filter((p) => p.id);
}

function normalizeKeywords(raw: unknown): SerankingKeyword[] {
  const list = Array.isArray(raw) ? raw : asArray((raw as { keywords?: unknown[]; data?: unknown[] })?.keywords ?? (raw as { data?: unknown[] })?.data);
  return list.map((it) => {
    const o = (it as Record<string, unknown>) ?? {};
    const cpcRaw = o["cpc"];
    return {
      id: String(getStr(o, "id", "keyword_id") ?? ""),
      keyword: String(getStr(o, "keyword", "name", "query") ?? ""),
      searchVolume: getInt(o, "search_volume", "volume", "searchVolume"),
      difficulty: getInt(o, "difficulty", "kw_difficulty", "keyword_difficulty"),
      cpc: typeof cpcRaw === "number" ? cpcRaw : undefined,
      intent: getStr(o, "intent", "search_intent"),
      groupName: getStr(o, "group", "group_name", "groupName")
    };
  }).filter((k) => k.keyword);
}

function normalizePositions(raw: unknown): SerankingPosition[] {
  const list = Array.isArray(raw) ? raw : asArray((raw as { positions?: unknown[]; data?: unknown[] })?.positions ?? (raw as { data?: unknown[] })?.data);
  return list.map((it) => {
    const o = (it as Record<string, unknown>) ?? {};
    const position = getInt(o, "position", "pos", "rank");
    const prev = getInt(o, "previous_position", "previousPosition", "prev_pos");
    return {
      keywordId: String(getStr(o, "keyword_id", "keywordId", "id") ?? ""),
      keyword: String(getStr(o, "keyword", "name") ?? ""),
      position: position ?? null,
      previousPosition: prev ?? null,
      url: getStr(o, "url", "landing_url"),
      date: String(getStr(o, "date", "check_date") ?? new Date().toISOString().slice(0, 10)),
      device: getStr(o, "device"),
      searchEngine: getStr(o, "search_engine", "engine")
    };
  });
}

function normalizeAuditIssues(raw: unknown): SerankingAuditIssue[] {
  const list = Array.isArray(raw) ? raw : asArray((raw as { issues?: unknown[]; data?: unknown[] })?.issues ?? (raw as { data?: unknown[] })?.data);
  const severityMap: Record<string, SerankingAuditIssue["severity"]> = {
    info: "info", low: "notice", notice: "notice",
    medium: "warning", warning: "warning", warn: "warning",
    high: "error", error: "error",
    critical: "critical", severe: "critical"
  };
  return list.map((it) => {
    const o = (it as Record<string, unknown>) ?? {};
    const sevRaw = String(getStr(o, "severity", "level", "priority") ?? "warning").toLowerCase();
    return {
      ruleCode: String(getStr(o, "code", "rule", "rule_code", "issue_code") ?? "unknown"),
      category: String(getStr(o, "category", "group") ?? "general"),
      severity: severityMap[sevRaw] ?? "warning",
      message: String(getStr(o, "message", "description", "title") ?? "Untitled issue"),
      affectedUrl: getStr(o, "url", "affected_url", "page_url"),
      details: typeof o["details"] === "object" ? (o["details"] as Record<string, unknown>) : undefined
    };
  });
}

function normalizeCompetitors(raw: unknown): SerankingCompetitor[] {
  const list = Array.isArray(raw) ? raw : asArray((raw as { competitors?: unknown[]; data?: unknown[] })?.competitors ?? (raw as { data?: unknown[] })?.data);
  return list.map((it) => {
    const o = (it as Record<string, unknown>) ?? {};
    return {
      domain: String(getStr(o, "domain", "competitor", "url") ?? ""),
      visibilityScore: getInt(o, "visibility", "visibility_score"),
      sharedKeywords: getInt(o, "shared_keywords", "common_keywords"),
      exclusiveKeywords: getInt(o, "exclusive_keywords", "unique_keywords")
    };
  }).filter((c) => c.domain);
}
