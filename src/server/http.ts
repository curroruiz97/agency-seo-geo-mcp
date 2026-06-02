import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { AppContext } from "../app/appContext.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { createHttpLogger } from "../utils/logger.js";
import { getHealthPayload, getReadinessPayload, getRootPayload } from "./health.js";
import { handleMcpRequest } from "./mcp.js";
import type { RequestHandler } from "express";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { requestId } from "./requestId.js";
import { requireMcpBearerToken, validateOrigin } from "./security.js";
import { InMemoryOAuthProvider, createOAuthLoginHandler } from "./oauth.js";

export function createHttpServer(context: AppContext) {
  const { config } = context;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
  app.use(createHttpLogger(config));
  app.use(
    cors({
      origin(origin, callback) {
        // Never throw on a disallowed origin: that surfaces as a 500 and breaks
        // browser navigations (e.g. the OAuth login form, which sends
        // `Origin: null`). Simply don't reflect the origin. The /mcp endpoint is
        // additionally guarded by validateOrigin + the bearer/OAuth token.
        const allowed = !origin || config.ALLOWED_ORIGINS.length === 0 || config.ALLOWED_ORIGINS.includes(origin);
        callback(null, allowed);
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));

  // Auth for /mcp. By default, the static bearer token middleware. If
  // MCP_OAUTH_PASSWORD is set, enable a full OAuth flow (so Claude's connector
  // can authenticate) while still accepting the static token for ChatGPT/curl.
  const baseUrl = config.PUBLIC_BASE_URL.replace(/\/$/, "");
  let mcpAuth: RequestHandler = requireMcpBearerToken(config);
  if (config.MCP_OAUTH_PASSWORD) {
    const oauthProvider = new InMemoryOAuthProvider({
      password: config.MCP_OAUTH_PASSWORD,
      staticToken: config.MCP_BEARER_TOKEN || undefined
    });
    app.use(
      mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl: new URL(baseUrl),
        resourceServerUrl: new URL(`${baseUrl}/mcp`),
        scopesSupported: ["mcp"],
        resourceName: SERVICE_NAME
      })
    );
    app.post("/oauth/login", express.urlencoded({ extended: false }), createOAuthLoginHandler(oauthProvider));
    mcpAuth = requireBearerAuth({
      verifier: oauthProvider,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(`${baseUrl}/mcp`))
    });
  }

  app.get("/", (_req, res) => {
    res.json(getRootPayload(config));
  });

  app.get("/health", (_req, res) => {
    res.json(getHealthPayload(config));
  });

  app.get("/ready", (_req, res) => {
    res.json(getReadinessPayload(config));
  });

  app.get("/version", (_req, res) => {
    res.json({
      service: SERVICE_NAME,
      version: SERVICE_VERSION
    });
  });

  app.all(
    "/mcp",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false
    }),
    validateOrigin(config),
    mcpAuth,
    async (req, res, next) => {
      try {
        await handleMcpRequest(context, req, res);
      } catch (error) {
        next(error);
      }
    }
  );

  app.use((_req, res) => {
    res.status(404).json({
      error: "not_found",
      message: "Route not found."
    });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    context.logger.error(
      { err: error instanceof Error ? { message: error.message, stack: error.stack } : error },
      "unhandled request error"
    );
    const message =
      config.NODE_ENV === "production"
        ? "Unexpected server error"
        : error instanceof Error
          ? error.message
          : "Unexpected server error";
    res.status(500).json({
      error: "internal_server_error",
      message
    });
  });

  return app;
}
