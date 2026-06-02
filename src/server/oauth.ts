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

const LOGO_URL = "https://avenuemedia.io/wp-content/uploads/2024/08/Logo-Avenue-Media-White-PNG-2025-II-1024x108.png";

// Real Avenue Media wordmark (white PNG), centred. Falls back to a styled text
// wordmark if the image cannot load, so the page never looks broken.
const LOGO_HTML = `<img class="logo" src="${LOGO_URL}" alt="Avenue Media" onerror="this.remove();var w=document.getElementById('wmf');if(w)w.style.display='block'">
    <div id="wmf" class="wmf">Avenue Media</div>`;

const PAGE_STYLE = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
@property --bd{syntax:'<angle>';initial-value:0deg;inherits:false}
:root{--bg:#06060a;--txt:#f5f5f8;--muted:#8a8a9c;--accent:#6d5efc;--accent2:#a98bff}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.glow{position:fixed;border-radius:50%;filter:blur(140px);z-index:0;pointer-events:none;will-change:transform}
.glow.a{width:600px;height:600px;top:-200px;left:-150px;background:radial-gradient(circle,#5b46ff,transparent 70%);opacity:.55;animation:drift1 17s ease-in-out infinite alternate}
.glow.b{width:660px;height:660px;bottom:-250px;right:-180px;background:radial-gradient(circle,#9b3cff,transparent 70%);opacity:.5;animation:drift2 21s ease-in-out infinite alternate}
.glow.c{width:440px;height:440px;top:42%;left:54%;background:radial-gradient(circle,#2f7bff,transparent 70%);opacity:.26;animation:drift3 24s ease-in-out infinite alternate}
@keyframes drift1{to{transform:translate(90px,70px) scale(1.18)}}
@keyframes drift2{to{transform:translate(-80px,-60px) scale(1.12)}}
@keyframes drift3{to{transform:translate(-70px,50px) scale(1.22)}}
.card{position:relative;z-index:1;width:100%;max-width:430px;text-align:center;background:linear-gradient(180deg,rgba(22,22,32,.78),rgba(12,12,19,.84));backdrop-filter:blur(28px) saturate(160%);-webkit-backdrop-filter:blur(28px) saturate(160%);border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:48px 42px 34px;box-shadow:0 50px 120px -30px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.07);animation:rise .85s cubic-bezier(.16,.84,.3,1) both}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.4px;background:conic-gradient(from var(--bd),transparent 0 30%,rgba(169,139,255,.85) 45%,rgba(123,94,255,1) 50%,rgba(169,139,255,.85) 55%,transparent 70% 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:spin 7s linear infinite;pointer-events:none}
@keyframes spin{to{--bd:360deg}}
@keyframes rise{from{opacity:0;transform:translateY(24px) scale(.955)}to{opacity:1;transform:none}}
.logo{display:block;width:230px;max-width:78%;height:auto;margin:2px auto 28px;filter:drop-shadow(0 6px 22px rgba(123,94,255,.5));animation:fadeUp .8s .15s both}
.wmf{display:none;font-size:19px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;margin:0 auto 28px;animation:fadeUp .8s .15s both}
h1{font-size:28px;line-height:1.16;font-weight:600;letter-spacing:-.025em;margin-bottom:11px;animation:fadeUp .8s .26s both}
.sub{color:var(--muted);font-size:14.5px;line-height:1.55;margin:0 auto 32px;max-width:312px;animation:fadeUp .8s .34s both}
form{animation:fadeUp .8s .42s both}
.field{margin-bottom:22px}
input[type=password]{width:100%;padding:16px;font-size:15px;text-align:center;letter-spacing:.16em;color:#fff;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:15px;transition:border-color .25s,box-shadow .25s,background .25s;outline:none}
input[type=password]::placeholder{color:#50506a;letter-spacing:.05em}
input[type=password]:focus{border-color:var(--accent);background:rgba(255,255,255,.06);box-shadow:0 0 0 4px rgba(109,94,252,.22)}
button{position:relative;overflow:hidden;width:100%;padding:16px;font-size:15px;font-weight:600;color:#0a0a12;cursor:pointer;background:linear-gradient(180deg,#fff,#e6e6f1);border:0;border-radius:15px;transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .3s,filter .2s;box-shadow:0 14px 38px -12px rgba(123,94,255,.6)}
button::after{content:"";position:absolute;top:0;left:-140%;width:65%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.65),transparent);transform:skewX(-18deg)}
button:hover{transform:translateY(-2px);box-shadow:0 24px 54px -14px rgba(123,94,255,.9);filter:brightness(1.04)}
button:hover::after{animation:sheen .85s ease}
button:active{transform:translateY(0)}
@keyframes sheen{from{left:-140%}to{left:140%}}
.err{display:flex;align-items:center;gap:9px;text-align:left;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);color:#ffb3b3;font-size:13.5px;line-height:1.4;padding:11px 14px;border-radius:13px;margin-bottom:22px;animation:shake .45s}
.err svg{width:16px;height:16px;flex:0 0 auto}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
.foot{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:30px;color:#54546a;font-size:12px;letter-spacing:.03em;animation:fadeUp .8s .5s both}
.foot svg{width:13px;height:13px;opacity:.75}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.001s!important;animation-iteration-count:1!important}}`;

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
<title>Avenue Media · Autorizar conexión</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="glow a"></div><div class="glow b"></div><div class="glow c"></div>
  <main class="card">
    ${LOGO_HTML}
    <h1>Autorizar conexión</h1>
    <p class="sub">Introduce la contraseña de la agencia para conceder acceso seguro a este conector.</p>
    ${errorBanner}
    <form method="POST" action="/oauth/login">
      <div class="field">
        <input type="password" name="password" autofocus required autocomplete="current-password" placeholder="Contraseña de la agencia">
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
<title>Avenue Media</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="glow a"></div><div class="glow b"></div><div class="glow c"></div>
  <main class="card">
    ${LOGO_HTML}
    <p class="sub" style="margin-bottom:6px;font-size:15px;color:var(--txt)">${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}
