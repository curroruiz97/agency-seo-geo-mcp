import { HttpClient } from "./http.js";
import type { Logger } from "pino";

/**
 * WordPress REST API client (core endpoints under /wp-json/wp/v2).
 * Auth via Application Passwords (Basic auth with user:app-password).
 *
 * Each WP site has its own client instance because credentials and base URLs
 * are per-site (multi-tenant).
 */

export interface WordPressClientOptions {
  baseUrl: string;            // e.g. https://example.com
  username: string;
  applicationPassword: string;
  logger?: Logger;
  rateLimitPerMinute?: number;
}

export interface WPPostSummary {
  id: number;
  title: string;
  slug: string;
  status: string;
  link: string;
  type: string;
  date: string;
  modified: string;
}

export interface WPPostFull extends WPPostSummary {
  content: string;
  contentRendered?: string;
  excerpt: string;
  meta?: Record<string, unknown>;
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number;
}

export interface WPCreatePostInput {
  type?: "post" | "page";
  title: string;
  content: string;
  status?: "draft" | "pending" | "publish" | "private" | "future";
  slug?: string;
  excerpt?: string;
  categories?: number[];
  tags?: number[];
  meta?: Record<string, unknown>;
  featured_media?: number;
  date?: string;
}

export interface WPUpdatePostInput {
  id: number;
  type?: "post" | "page";
  title?: string;
  content?: string;
  status?: "draft" | "pending" | "publish" | "private" | "future";
  slug?: string;
  excerpt?: string;
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  meta?: Record<string, unknown>;
}

export class WordPressClient {
  private http: HttpClient;
  private readonly authHeader: string;

  constructor(opts: WordPressClientOptions) {
    this.authHeader = `Basic ${Buffer.from(`${opts.username}:${opts.applicationPassword}`).toString("base64")}`;
    this.http = new HttpClient({
      baseUrl: `${opts.baseUrl.replace(/\/$/, "")}/wp-json`,
      defaultHeaders: { Authorization: this.authHeader },
      rateLimitPerMinute: opts.rateLimitPerMinute ?? 60,
      logger: opts.logger
    });
  }

  // --- Posts ---
  async listPosts(opts?: {
    status?: string;
    per_page?: number;
    page?: number;
    search?: string;
    type?: "post" | "page";
  }): Promise<WPPostSummary[]> {
    const type = opts?.type ?? "post";
    const raw = await this.http.request<unknown[]>("GET", `/wp/v2/${type}s`, {
      query: {
        status: opts?.status ?? "publish",
        per_page: opts?.per_page ?? 50,
        page: opts?.page ?? 1,
        search: opts?.search,
        context: "edit"
      }
    });
    return (raw ?? []).map(toSummary);
  }

  async getPost(id: number, type: "post" | "page" = "post"): Promise<WPPostFull> {
    const raw = await this.http.request<Record<string, unknown>>(
      "GET",
      `/wp/v2/${type}s/${id}`,
      { query: { context: "edit" } }
    );
    return toFull(raw);
  }

  async createPost(input: WPCreatePostInput): Promise<WPPostFull> {
    const type = input.type ?? "post";
    const raw = await this.http.request<Record<string, unknown>>(
      "POST",
      `/wp/v2/${type}s`,
      { body: input }
    );
    return toFull(raw);
  }

  async updatePost(input: WPUpdatePostInput): Promise<WPPostFull> {
    const type = input.type ?? "post";
    const raw = await this.http.request<Record<string, unknown>>(
      "POST",
      `/wp/v2/${type}s/${input.id}`,
      { body: input }
    );
    return toFull(raw);
  }

  // --- Taxonomies ---
  async listCategories(perPage = 100): Promise<Array<{ id: number; name: string; slug: string }>> {
    const raw = await this.http.request<unknown[]>("GET", "/wp/v2/categories", {
      query: { per_page: perPage }
    });
    return (raw ?? []).map((it) => {
      const o = (it as Record<string, unknown>) ?? {};
      return { id: Number(o["id"]), name: String(o["name"] ?? ""), slug: String(o["slug"] ?? "") };
    });
  }

  async listTags(perPage = 100): Promise<Array<{ id: number; name: string; slug: string }>> {
    const raw = await this.http.request<unknown[]>("GET", "/wp/v2/tags", {
      query: { per_page: perPage }
    });
    return (raw ?? []).map((it) => {
      const o = (it as Record<string, unknown>) ?? {};
      return { id: Number(o["id"]), name: String(o["name"] ?? ""), slug: String(o["slug"] ?? "") };
    });
  }

  // --- Media ---
  /** Find an existing attachment by its slug (used for idempotent sideloading). */
  async findMediaBySlug(slug: string): Promise<{ id: number; sourceUrl: string; altText: string } | null> {
    if (!slug) return null;
    const raw = await this.http.request<unknown[]>("GET", "/wp/v2/media", {
      query: { slug, per_page: 1, context: "edit" }
    });
    const first = Array.isArray(raw) ? (raw[0] as Record<string, unknown> | undefined) : undefined;
    if (!first || first["id"] === undefined) return null;
    return {
      id: Number(first["id"]),
      sourceUrl: String(first["source_url"] ?? ""),
      altText: String((first["alt_text"] as string) ?? "")
    };
  }

  /**
   * Sideload a remote image into the Media Library and return its local id + URL.
   * Idempotent: derives a deterministic slug from `filename` and reuses an existing
   * attachment with that slug instead of creating a duplicate. Always sets alt text
   * so Elementor/RankMath/srcset pick it up. The local source_url is what callers
   * must embed in content — never the external URL.
   */
  async uploadMediaFromUrl(opts: {
    fileUrl: string;
    filename: string;
    altText?: string;
    mimeType?: string;
    reuseExisting?: boolean;
  }): Promise<{ id: number; sourceUrl: string; reused: boolean }> {
    assertPublicHttpUrl(opts.fileUrl);
    const base = baseSlug(opts.filename);

    if (opts.reuseExisting !== false && base) {
      const existing = await this.findMediaBySlug(base);
      if (existing) {
        if (opts.altText && opts.altText !== existing.altText) {
          await this.http.request("POST", `/wp/v2/media/${existing.id}`, { body: { alt_text: opts.altText } });
        }
        return { id: existing.id, sourceUrl: existing.sourceUrl, reused: true };
      }
    }

    // Two-step: fetch the asset server-side, then POST it as a binary upload.
    const assetRes = await fetch(opts.fileUrl);
    if (!assetRes.ok) throw new Error(`Could not fetch media source: ${opts.fileUrl}`);
    const buf = Buffer.from(await assetRes.arrayBuffer());
    const mime = opts.mimeType ?? assetRes.headers.get("content-type") ?? "image/jpeg";
    const filename = `${base || "image"}.${extFromMime(mime)}`;

    const raw = await this.http.request<Record<string, unknown>>("POST", "/wp/v2/media", {
      body: buf,
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": mime
      }
    });
    const id = Number(raw["id"]);
    const sourceUrl = String(raw["source_url"] ?? "");

    if (opts.altText) {
      await this.http.request("POST", `/wp/v2/media/${id}`, { body: { alt_text: opts.altText } });
    }
    return { id, sourceUrl, reused: false };
  }

  // --- Render verification helpers ---
  // NOTE: Application Passwords authenticate REST/XML-RPC requests only, NOT
  // front-end page loads, so a GET to a private/draft post's permalink returns
  // 404. Render verification therefore uses the REST content.rendered (authenticated,
  // applies the_content()) plus a public HEAD on each media file below.

  /** HEAD a URL (authenticated) and return its HTTP status, or 0 on transport error. */
  async headStatus(url: string): Promise<number> {
    try {
      const res = await fetch(url, { method: "HEAD", headers: { Authorization: this.authHeader } });
      return res.status;
    } catch {
      return 0;
    }
  }

  // --- Health ---
  async ping(): Promise<{ ok: boolean; version?: string }> {
    const raw = await this.http.request<Record<string, unknown>>("GET", "/");
    return { ok: true, version: String((raw as Record<string, unknown>)["version"] ?? "") };
  }
}

function toSummary(raw: unknown): WPPostSummary {
  const o = (raw as Record<string, unknown>) ?? {};
  const title = o["title"] as { rendered?: string } | string;
  return {
    id: Number(o["id"]),
    title: typeof title === "string" ? title : String(title?.rendered ?? ""),
    slug: String(o["slug"] ?? ""),
    status: String(o["status"] ?? ""),
    link: String(o["link"] ?? ""),
    type: String(o["type"] ?? "post"),
    date: String(o["date"] ?? ""),
    modified: String(o["modified"] ?? "")
  };
}

function toFull(raw: Record<string, unknown>): WPPostFull {
  const summary = toSummary(raw);
  const content = raw["content"] as { rendered?: string; raw?: string } | string;
  const excerpt = raw["excerpt"] as { rendered?: string; raw?: string } | string;
  return {
    ...summary,
    content: typeof content === "string" ? content : String(content?.raw ?? content?.rendered ?? ""),
    contentRendered: typeof content === "string" ? content : String(content?.rendered ?? content?.raw ?? ""),
    excerpt: typeof excerpt === "string" ? excerpt : String(excerpt?.raw ?? excerpt?.rendered ?? ""),
    meta: (raw["meta"] as Record<string, unknown>) ?? {},
    categories: Array.isArray(raw["categories"]) ? (raw["categories"] as number[]) : [],
    tags: Array.isArray(raw["tags"]) ? (raw["tags"] as number[]) : [],
    featuredMediaId: typeof raw["featured_media"] === "number" ? (raw["featured_media"] as number) : undefined
  };
}

/**
 * SSRF guard for server-side media fetches. Best-effort host allow-listing:
 * rejects non-http(s) schemes, loopback, link-local, RFC1918 private ranges and
 * cloud metadata endpoints. Note: this checks the literal host only and does not
 * resolve DNS, so it is not a defence against DNS rebinding — add resolution +
 * re-check at connect time before exposing this to untrusted callers.
 */
function assertPublicHttpUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid media source URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Media source URL must be http(s): ${raw}`);
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
    host === "metadata.google.internal" || host === "0.0.0.0" || host === "::1" ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) ||
    host.startsWith("fc") || host.startsWith("fd"); // unique-local IPv6
  if (blocked) {
    throw new Error(`Media source URL host is not allowed (private/loopback/metadata): ${host}`);
  }
}

/** Slugify a filename (strip path + extension, transliterate accents) for idempotent media lookups. */
function baseSlug(filename: string): string {
  const name = (filename.split(/[\\/]/).pop() ?? filename).replace(/\.[a-z0-9]{1,5}$/i, "");
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Map a content-type to a file extension WordPress will accept. */
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("avif")) return "avif";
  if (m.includes("svg")) return "svg";
  return "jpg";
}
