import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env.js";

export function validateOrigin(config: Pick<AppConfig, "ALLOWED_ORIGINS">) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");

    if (!origin || config.ALLOWED_ORIGINS.length === 0 || config.ALLOWED_ORIGINS.includes(origin)) {
      next();
      return;
    }

    res.status(403).json({
      error: "origin_not_allowed",
      message: "The request origin is not allowed for this MCP server."
    });
  };
}

export function requireMcpBearerToken(config: Pick<AppConfig, "MCP_BEARER_TOKEN">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.MCP_BEARER_TOKEN) {
      next();
      return;
    }

    const expected = `Bearer ${config.MCP_BEARER_TOKEN}`;
    const actual = req.header("authorization");

    if (actual && safeEqual(actual, expected)) {
      next();
      return;
    }

    res.setHeader("WWW-Authenticate", 'Bearer realm="agency-seo-geo-mcp"');
    res.status(401).json({
      error: "unauthorized",
      message: "A valid bearer token is required for this MCP endpoint."
    });
  };
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
