import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { AppContext } from "../app/appContext.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { createHttpLogger } from "../utils/logger.js";
import { getHealthPayload, getReadinessPayload } from "./health.js";
import { handleMcpRequest } from "./mcp.js";
import { requestId } from "./requestId.js";
import { requireMcpBearerToken, validateOrigin } from "./security.js";

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
        if (!origin || config.ALLOWED_ORIGINS.length === 0 || config.ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed"));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));

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
    requireMcpBearerToken(config),
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
