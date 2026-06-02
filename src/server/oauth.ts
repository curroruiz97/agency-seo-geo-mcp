import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

/**
 * Minimal, self-contained OAuth 2.1 Authorization Server for the MCP endpoint.
 *
 * Why: Claude.ai's MCP connector authenticates via OAuth (Dynamic Client
 * Registration + Authorization Code + PKCE); it cannot send a static bearer
 * token. This provider implements just enough of the OAuth surface (wired up by
 * the SDK's `mcpAuthRouter`) so Claude can connect, while a simple shared
 * password gates the `/authorize` login.
 *
 * Backward compatibility: `verifyAccessToken` also accepts the existing static
 * `MCP_BEARER_TOKEN`, so ChatGPT / curl / the WordPress plugin keep working.
 *
 * Storage is in-memory: tokens and registered clients are lost on restart
 * (every deploy), so clients re-authorize. This is acceptable for a small team;
 * move to Postgres-backed storage if re-auth-on-deploy becomes annoying.
 */

const CODE_TTL_MS = 5 * 60 * 1000; // authorization code: 5 minutes
const ACCESS_TTL_S = 60 * 60; // access token: 1 hour

type StoredCode = { clientId: string; codeChallenge: string; redirectUri: string; scopes: string[]; expiresAt: number };
type StoredAccess = { clientId: string; scopes: string[]; expiresAt: number };
type StoredRefresh = { clientId: string; scopes: string[] };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

export class InMemoryOAuthProvider implements OAuthServerProvider {
  private clients = new Map<string, OAuthClientInformationFull>();
  private codes = new Map<string, StoredCode>();
  private accessTokens = new Map<string, StoredAccess>();
  private refreshTokens = new Map<string, StoredRefresh>();

  constructor(private opts: { password: string; staticToken?: string }) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.clients.get(clientId),
      registerClient: (client) => {
        const full = client as OAuthClientInformationFull;
        this.clients.set(full.client_id, full);
        return full;
      }
    };
  }

  /**
   * Render a password login page. The form posts the OAuth params + password to
   * POST /oauth/login (registered in http.ts), which issues the code + redirect.
   */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderLoginPage({
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        scopes: params.scopes ?? [],
        error: false
      })
    );
  }

  /** Called by the /oauth/login route after the password is verified. */
  issueAuthorizationCode(input: { clientId: string; redirectUri: string; codeChallenge: string; scopes: string[] }): string {
    const code = randomBytes(32).toString("base64url");
    this.codes.set(code, { ...input, expiresAt: Date.now() + CODE_TTL_MS });
    return code;
  }

  verifyPassword(password: string): boolean {
    return Boolean(this.opts.password) && safeEqual(password, this.opts.password);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const entry = this.codes.get(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens> {
    const entry = this.codes.get(authorizationCode);
    this.codes.delete(authorizationCode); // single use
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    if (entry.expiresAt < Date.now()) {
      throw new InvalidGrantError("Authorization code expired");
    }
    return this.issueTokens(client.client_id, entry.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    const entry = this.refreshTokens.get(refreshToken);
    this.refreshTokens.delete(refreshToken); // rotate
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token");
    }
    return this.issueTokens(client.client_id, scopes && scopes.length > 0 ? scopes : entry.scopes);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Backward compatibility: the existing static bearer token still works.
    if (this.opts.staticToken && safeEqual(token, this.opts.staticToken)) {
      // The static token never expires, but the SDK's bearer middleware rejects
      // tokens without an `expiresAt`. Advertise a far-future expiry (recomputed
      // each request) so it is always accepted.
      return {
        token,
        clientId: "static-bearer",
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
      };
    }
    const entry = this.accessTokens.get(token);
    if (!entry) {
      throw new InvalidTokenError("Invalid or unknown access token");
    }
    if (entry.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      throw new InvalidTokenError("Access token expired");
    }
    return { token, clientId: entry.clientId, scopes: entry.scopes, expiresAt: Math.floor(entry.expiresAt / 1000) };
  }

  private issueTokens(clientId: string, scopes: string[]): OAuthTokens {
    const accessToken = randomBytes(32).toString("base64url");
    const refreshToken = randomBytes(32).toString("base64url");
    this.accessTokens.set(accessToken, { clientId, scopes, expiresAt: Date.now() + ACCESS_TTL_S * 1000 });
    this.refreshTokens.set(refreshToken, { clientId, scopes });
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token: refreshToken,
      scope: scopes.length > 0 ? scopes.join(" ") : undefined
    };
  }
}

/**
 * Express handler for POST /oauth/login: verifies the shared password, then
 * issues an authorization code and redirects back to the client (Claude).
 */
export function createOAuthLoginHandler(provider: InMemoryOAuthProvider) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, string | undefined>;
    const password = String(body.password ?? "");
    const clientId = String(body.client_id ?? "");
    const redirectUri = String(body.redirect_uri ?? "");
    const codeChallenge = String(body.code_challenge ?? "");
    const state = body.state ? String(body.state) : undefined;
    const scope = body.scope ? String(body.scope) : undefined;

    const client = await provider.clientsStore.getClient(clientId);
    if (!client || !redirectUri || !client.redirect_uris.includes(redirectUri) || !codeChallenge) {
      res.status(400).setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderMessagePage("Solicitud de autorización inválida o expirada. Vuelve a iniciar la conexión desde Claude."));
      return;
    }

    if (!provider.verifyPassword(password)) {
      res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderLoginPage({ clientId, redirectUri, codeChallenge, state, scopes: scope ? scope.split(" ") : [], error: true }));
      return;
    }

    const code = provider.issueAuthorizationCode({
      clientId,
      redirectUri,
      codeChallenge,
      scopes: scope ? scope.split(" ").filter(Boolean) : []
    });

    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    res.redirect(302, url.href);
  };
}

function renderLoginPage(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  error: boolean;
}): string {
  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
  const errorBanner = input.error
    ? `<p style="color:#b91c1c;margin:0 0 12px">Contraseña incorrecta. Inténtalo de nuevo.</p>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avenue MCP — Autorizar conexión</title></head>
<body style="font-family:system-ui,sans-serif;background:#f3f4f6;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<form method="POST" action="/oauth/login" style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);width:320px">
<h1 style="font-size:18px;margin:0 0 4px">Avenue MCP</h1>
<p style="color:#6b7280;margin:0 0 20px;font-size:14px">Autoriza el acceso introduciendo la contraseña de la agencia.</p>
${errorBanner}
<label style="display:block;font-size:13px;margin-bottom:6px">Contraseña</label>
<input type="password" name="password" autofocus required autocomplete="current-password"
 style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:16px">
${hidden("client_id", input.clientId)}
${hidden("redirect_uri", input.redirectUri)}
${hidden("code_challenge", input.codeChallenge)}
${input.state ? hidden("state", input.state) : ""}
${input.scopes.length > 0 ? hidden("scope", input.scopes.join(" ")) : ""}
<button type="submit" style="width:100%;padding:10px;background:#4f46e5;color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer">Autorizar</button>
</form></body></html>`;
}

function renderMessagePage(message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Avenue MCP</title></head>
<body style="font-family:system-ui,sans-serif;background:#f3f4f6;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<p style="background:#fff;padding:24px 32px;border-radius:12px;color:#374151;max-width:360px;text-align:center">${escapeHtml(message)}</p>
</body></html>`;
}
