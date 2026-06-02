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

const BRAND_LOGO_SVG = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><linearGradient id="amg" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
<stop stop-color="#a98bff"/><stop offset="1" stop-color="#5b46ff"/></linearGradient></defs>
<path d="M24 3.6 41.86 13.8v20.4L24 44.4 6.14 34.2V13.8L24 3.6Z" stroke="url(#amg)" stroke-width="2.1" fill="rgba(109,94,252,.10)"/>
<path d="M24 14.6v18.8M15.4 19.4 24 24.3l8.6-4.9" stroke="url(#amg)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PAGE_STYLE = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#07070b;--card:rgba(19,19,27,.72);--line:rgba(255,255,255,.09);--txt:#f4f4f7;--muted:#8b8b9c;--accent:#6d5efc}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body::before,body::after{content:"";position:fixed;border-radius:50%;filter:blur(130px);opacity:.5;z-index:0;pointer-events:none}
body::before{width:560px;height:560px;top:-190px;left:-130px;background:radial-gradient(circle,#5b46ff,transparent 70%)}
body::after{width:620px;height:620px;bottom:-230px;right:-170px;background:radial-gradient(circle,#8b3cff,transparent 70%)}
.card{position:relative;z-index:1;width:100%;max-width:404px;background:var(--card);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border:1px solid var(--line);border-radius:24px;padding:42px 38px 30px;box-shadow:0 40px 90px -24px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.06);animation:rise .65s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
.logo{display:flex;align-items:center;gap:12px;margin-bottom:32px}
.logo svg{width:42px;height:42px;display:block}
.wm{font-weight:600;font-size:14px;letter-spacing:.16em;text-transform:uppercase}.wm span{color:var(--muted)}
h1{font-size:27px;line-height:1.18;font-weight:600;letter-spacing:-.02em;margin-bottom:9px}
.sub{color:var(--muted);font-size:14.5px;line-height:1.55;margin-bottom:28px}
label{display:block;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.field{margin-bottom:22px}
input[type=password]{width:100%;padding:15px 16px;font-size:15px;color:#fff;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:13px;transition:border-color .2s,box-shadow .2s,background .2s;outline:none}
input[type=password]::placeholder{color:#54546a;letter-spacing:.12em}
input[type=password]:focus{border-color:var(--accent);background:rgba(255,255,255,.06);box-shadow:0 0 0 4px rgba(109,94,252,.2)}
button{width:100%;padding:15px;font-size:15px;font-weight:600;color:#0a0a12;cursor:pointer;background:linear-gradient(180deg,#fff,#e7e7f1);border:0;border-radius:13px;transition:transform .15s,box-shadow .25s,filter .2s;box-shadow:0 12px 32px -10px rgba(123,94,255,.55)}
button:hover{transform:translateY(-1px);box-shadow:0 18px 44px -12px rgba(123,94,255,.75);filter:brightness(1.03)}
button:active{transform:translateY(0)}
.err{display:flex;align-items:center;gap:9px;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);color:#ffb3b3;font-size:13.5px;line-height:1.4;padding:11px 14px;border-radius:12px;margin-bottom:22px}
.err svg{width:16px;height:16px;flex:0 0 auto}
.foot{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:26px;color:#56566a;font-size:12px;letter-spacing:.03em}
.foot svg{width:13px;height:13px;opacity:.75}`;

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
  const hiddenFields = [
    hidden("client_id", input.clientId),
    hidden("redirect_uri", input.redirectUri),
    hidden("code_challenge", input.codeChallenge),
    input.state ? hidden("state", input.state) : "",
    input.scopes.length > 0 ? hidden("scope", input.scopes.join(" ")) : ""
  ]
    .filter(Boolean)
    .join("\n      ");
  const errorBanner = input.error
    ? `<div class="err"><svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3.5h.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Contraseña incorrecta. Vuelve a intentarlo.</div>`
    : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Avenue MCP · Autorizar conexión</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <main class="card">
    <div class="logo">${BRAND_LOGO_SVG}<div class="wm">Avenue<span> MCP</span></div></div>
    <h1>Autorizar conexión</h1>
    <p class="sub">Introduce la contraseña de la agencia para conceder acceso seguro a este conector.</p>
    ${errorBanner}
    <form method="POST" action="/oauth/login">
      <div class="field">
        <label for="pw">Contraseña</label>
        <input id="pw" type="password" name="password" autofocus required autocomplete="current-password" placeholder="••••••••••••">
      </div>
      ${hiddenFields}
      <button type="submit">Autorizar acceso</button>
    </form>
    <div class="foot"><svg viewBox="0 0 24 24" fill="none"><path d="M6 10V8a6 6 0 1 1 12 0v2" stroke="currentColor" stroke-width="2"/><rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" stroke-width="2"/></svg>Conexión cifrada · OAuth 2.1 + PKCE</div>
  </main>
</body>
</html>`;
}

function renderMessagePage(message: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Avenue MCP</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <main class="card" style="text-align:center">
    <div class="logo" style="justify-content:center">${BRAND_LOGO_SVG}<div class="wm">Avenue<span> MCP</span></div></div>
    <p class="sub" style="margin-bottom:8px;font-size:15px;color:var(--txt)">${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}
