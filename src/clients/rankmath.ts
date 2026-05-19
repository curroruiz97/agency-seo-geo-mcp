import type { Logger } from "pino";
import { HttpClient } from "./http.js";

/**
 * RankMath Pro REST client.
 *
 * RankMath stores SEO metadata as WP post meta keys (e.g. rank_math_title,
 * rank_math_description, rank_math_focus_keyword) and exposes them through
 * the WP REST API once the post type's `show_in_rest` is enabled and the
 * meta keys are registered (RankMath Pro does this automatically for
 * registered post types).
 *
 * For some operations (schema, redirections, content AI) RankMath exposes
 * its own REST namespace `rankmath/v1`. We support both transparently.
 *
 * Auth: piggybacks on WP Application Passwords (same Basic auth).
 */

export interface RankMathClientOptions {
  baseUrl: string;
  username: string;
  applicationPassword: string;
  logger?: Logger;
  rateLimitPerMinute?: number;
}

export interface RankMathPostMeta {
  postId: number;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  secondaryKeywords?: string[];
  canonicalUrl?: string;
  robots?: string[];
  schemaType?: string;
  schemaPayload?: Record<string, unknown>;
}

export interface RankMathRedirection {
  id?: number;
  sources: Array<{ pattern: string; comparison?: "exact" | "contains" | "start" | "end" | "regex" }>;
  url_to: string;
  status_code?: 301 | 302 | 307 | 410 | 451;
  hits?: number;
  status?: "active" | "inactive";
}

const META_KEYS = {
  title: "rank_math_title",
  description: "rank_math_description",
  focus: "rank_math_focus_keyword",
  secondaryFocus: "rank_math_secondary_focus_keyword",
  canonical: "rank_math_canonical_url",
  robots: "rank_math_robots",
  schemaType: "rank_math_rich_snippet",
  schemaPayload: "rank_math_schema"
};

export class RankMathClient {
  private http: HttpClient;

  constructor(private opts: RankMathClientOptions) {
    const authToken = Buffer.from(`${opts.username}:${opts.applicationPassword}`).toString("base64");
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/wp-json`,
      defaultHeaders: { Authorization: `Basic ${authToken}` },
      rateLimitPerMinute: opts.rateLimitPerMinute ?? 60,
      logger: opts.logger
    });
  }

  // --- Meta ---
  async getPostMeta(postId: number, type: "post" | "page" = "post"): Promise<RankMathPostMeta> {
    const raw = await this.http.request<Record<string, unknown>>(
      "GET",
      `/wp/v2/${type}s/${postId}`,
      { query: { context: "edit" } }
    );
    const meta = (raw["meta"] as Record<string, unknown>) ?? {};
    const secondary = meta[META_KEYS.secondaryFocus];
    return {
      postId,
      metaTitle: meta[META_KEYS.title] as string | undefined,
      metaDescription: meta[META_KEYS.description] as string | undefined,
      focusKeyword: meta[META_KEYS.focus] as string | undefined,
      secondaryKeywords: typeof secondary === "string" ? secondary.split(",").map((s) => s.trim()).filter(Boolean) : [],
      canonicalUrl: meta[META_KEYS.canonical] as string | undefined,
      robots: Array.isArray(meta[META_KEYS.robots]) ? (meta[META_KEYS.robots] as string[]) : [],
      schemaType: meta[META_KEYS.schemaType] as string | undefined,
      schemaPayload: meta[META_KEYS.schemaPayload] as Record<string, unknown> | undefined
    };
  }

  async updatePostMeta(input: RankMathPostMeta, type: "post" | "page" = "post"): Promise<RankMathPostMeta> {
    const meta: Record<string, unknown> = {};
    if (input.metaTitle !== undefined) meta[META_KEYS.title] = input.metaTitle;
    if (input.metaDescription !== undefined) meta[META_KEYS.description] = input.metaDescription;
    if (input.focusKeyword !== undefined) meta[META_KEYS.focus] = input.focusKeyword;
    if (input.secondaryKeywords !== undefined) meta[META_KEYS.secondaryFocus] = input.secondaryKeywords.join(",");
    if (input.canonicalUrl !== undefined) meta[META_KEYS.canonical] = input.canonicalUrl;
    if (input.robots !== undefined) meta[META_KEYS.robots] = input.robots;
    if (input.schemaType !== undefined) meta[META_KEYS.schemaType] = input.schemaType;
    if (input.schemaPayload !== undefined) meta[META_KEYS.schemaPayload] = input.schemaPayload;

    await this.http.request("POST", `/wp/v2/${type}s/${input.postId}`, {
      body: { meta }
    });
    return this.getPostMeta(input.postId, type);
  }

  // --- Redirections (RankMath Pro: rank-math/v1/redirections) ---
  async listRedirections(opts?: { limit?: number; offset?: number }): Promise<RankMathRedirection[]> {
    const raw = await this.http.request<unknown>(
      "GET",
      "/rank-math/v1/redirections",
      { query: { limit: opts?.limit ?? 100, offset: opts?.offset ?? 0 } }
    );
    const list = Array.isArray(raw) ? raw : ((raw as { redirections?: unknown[] })?.redirections ?? []);
    return list.map(toRedirection);
  }

  async createRedirection(input: RankMathRedirection): Promise<RankMathRedirection> {
    const raw = await this.http.request<Record<string, unknown>>(
      "POST",
      "/rank-math/v1/redirections",
      { body: input }
    );
    return toRedirection(raw);
  }
}

function toRedirection(raw: unknown): RankMathRedirection {
  const o = (raw as Record<string, unknown>) ?? {};
  return {
    id: typeof o["id"] === "number" ? (o["id"] as number) : undefined,
    sources: Array.isArray(o["sources"]) ? (o["sources"] as RankMathRedirection["sources"]) : [],
    url_to: String(o["url_to"] ?? ""),
    status_code: o["status_code"] as RankMathRedirection["status_code"],
    hits: typeof o["hits"] === "number" ? (o["hits"] as number) : undefined,
    status: o["status"] as RankMathRedirection["status"]
  };
}
