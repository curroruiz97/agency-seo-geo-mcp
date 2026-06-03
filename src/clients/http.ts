import type { Logger } from "pino";

/**
 * Minimal HTTP client wrapper with:
 * - Automatic JSON parse
 * - Retry on 429/5xx with exponential backoff
 * - Per-host rate limiting (token bucket)
 * - Pino logging
 */

export interface HttpClientOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  rateLimitPerMinute?: number;
  maxRetries?: number;
  timeoutMs?: number;
  logger?: Logger;
}

interface RateLimiter {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillIntervalMs: number;
}

const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(host: string, perMinute: number): RateLimiter {
  let limiter = rateLimiters.get(host);
  if (!limiter) {
    limiter = {
      tokens: perMinute,
      lastRefill: Date.now(),
      capacity: perMinute,
      refillIntervalMs: 60_000
    };
    rateLimiters.set(host, limiter);
  }
  return limiter;
}

async function consumeToken(host: string, perMinute: number): Promise<void> {
  if (perMinute <= 0) return;
  const limiter = getRateLimiter(host, perMinute);

  while (true) {
    const now = Date.now();
    const elapsed = now - limiter.lastRefill;
    const refill = (elapsed / limiter.refillIntervalMs) * limiter.capacity;
    limiter.tokens = Math.min(limiter.capacity, limiter.tokens + refill);
    limiter.lastRefill = now;

    if (limiter.tokens >= 1) {
      limiter.tokens -= 1;
      return;
    }

    const waitMs = ((1 - limiter.tokens) / limiter.capacity) * limiter.refillIntervalMs;
    await new Promise((r) => setTimeout(r, Math.max(50, Math.min(2000, waitMs))));
  }
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    init?: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    const url = this.buildUrl(path, init?.query);
    const host = new URL(url).host;
    const perMinute = this.options.rateLimitPerMinute ?? 0;
    if (perMinute > 0) await consumeToken(host, perMinute);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(this.options.defaultHeaders ?? {}),
      ...(init?.headers ?? {})
    };

    const fetchInit: RequestInit = { method, headers };
    if (init?.body !== undefined) {
      const body = init.body;
      // Binary bodies (e.g. media uploads) MUST be passed through untouched.
      // JSON.stringify(Buffer) yields '{"type":"Buffer","data":[...]}', which the
      // server then rejects as an invalid/zero-byte file. The caller is responsible
      // for setting Content-Type (e.g. image/jpeg) on binary uploads.
      if (Buffer.isBuffer(body) || body instanceof Uint8Array || body instanceof ArrayBuffer) {
        fetchInit.body = body as BodyInit;
      } else if (typeof body === "string") {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        fetchInit.body = body;
      } else {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        fetchInit.body = JSON.stringify(body);
      }
    }

    const maxRetries = this.options.maxRetries ?? 3;
    const timeoutMs = this.options.timeoutMs ?? 30_000;

    // Only safe methods may be retried on 5xx / transport errors: retrying a
    // POST/PUT/PATCH/DELETE whose write may already have applied risks duplicate
    // side effects (e.g. duplicate posts or redirections). A 429 is safe to retry
    // for any method because the request was rejected before processing.
    const idempotent = method === "GET";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...fetchInit, signal: ctrl.signal });
        clearTimeout(t);

        if (res.status === 429 || (res.status >= 500 && idempotent)) {
          if (attempt < maxRetries) {
            const backoff = Math.min(10_000, 500 * Math.pow(2, attempt));
            this.options.logger?.warn({ url, method, status: res.status, attempt }, "HTTP retry");
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
        }

        const text = await res.text();
        if (!res.ok) {
          const err = new HttpError(res.status, res.statusText, text);
          this.options.logger?.error({ url, status: res.status, body: text.slice(0, 500) }, "HTTP error");
          throw err;
        }

        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      } catch (e) {
        clearTimeout(t);
        if (e instanceof HttpError) throw e;
        if (idempotent && attempt < maxRetries) {
          const backoff = Math.min(10_000, 500 * Math.pow(2, attempt));
          this.options.logger?.warn({ url, method, attempt, err: String(e) }, "HTTP transport retry");
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw e;
      }
    }
    throw new Error("HTTP retry budget exhausted");
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const base = this.options.baseUrl.replace(/\/$/, "");
    const fullPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(base + fullPath);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}

export class HttpError extends Error {
  constructor(public status: number, public statusText: string, public body: string) {
    super(`HTTP ${status} ${statusText}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
  }
}
