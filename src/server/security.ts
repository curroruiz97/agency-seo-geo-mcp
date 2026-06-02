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

const publicDiscoveryMethods = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "prompts/list"
]);

export function requireMcpBearerToken(
  config: Pick<AppConfig, "MCP_BEARER_TOKEN" | "ALLOW_PUBLIC_MCP_DISCOVERY" | "REQUIRE_MCP_AUTH">
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.MCP_BEARER_TOKEN) {
      // No token configured. If auth is required (the default), fail closed
      // instead of silently exposing every tool. Only an explicit
      // REQUIRE_MCP_AUTH=false (dev/local) leaves the endpoint open.
      if (config.REQUIRE_MCP_AUTH) {
        res.status(503).json({
          error: "auth_misconfigured",
          message: "MCP authentication is required but no MCP_BEARER_TOKEN is configured."
        });
        return;
      }
      next();
      return;
    }

    if (config.ALLOW_PUBLIC_MCP_DISCOVERY && isPublicMcpDiscoveryRequest(req)) {
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

function isPublicMcpDiscoveryRequest(req: Request) {
  if (req.method !== "POST") {
    return false;
  }

  const body = req.body as unknown;
  const messages = Array.isArray(body) ? body : [body];

  return messages.every(
    (message) =>
      message &&
      typeof message === "object" &&
      "method" in message &&
      typeof message.method === "string" &&
      publicDiscoveryMethods.has(message.method)
  );
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
