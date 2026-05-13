import express from "express";
import cors from "cors";
import type { AppConfig } from "../config/env.js";
import { createHttpLogger } from "../utils/logger.js";
import { getHealthPayload } from "./health.js";
import { handleMcpRequest } from "./mcp.js";
import { requireMcpBearerToken, validateOrigin } from "./security.js";

export function createHttpServer(config: AppConfig) {
  const app = express();

  app.disable("x-powered-by");
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

  app.all("/mcp", validateOrigin(config), requireMcpBearerToken(config), async (req, res, next) => {
    try {
      await handleMcpRequest(config, req, res);
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({
      error: "not_found",
      message: "Route not found."
    });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({
      error: "internal_server_error",
      message
    });
  });

  return app;
}
