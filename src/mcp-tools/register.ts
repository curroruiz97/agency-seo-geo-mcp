import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/env.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { getHealthPayload } from "../server/health.js";
import { jsonToolResponse } from "./response.js";
import { listMockProjects } from "./projects.fixture.js";

export function registerTools(server: McpServer, config: AppConfig) {
  server.tool("ping", "Health probe for the Agency SEO/GEO MCP server.", {}, async () =>
    jsonToolResponse({
      ok: true,
      message: "pong",
      timestamp: new Date().toISOString()
    })
  );

  server.tool(
    "list_projects",
    "List mock agency projects registered for Sprint 1. This never returns credentials or real customer data.",
    {
      status: z.enum(["active", "paused", "all"]).optional().default("active"),
      limit: z.number().int().positive().max(50).optional().default(50)
    },
    async ({ status, limit }) =>
      jsonToolResponse({
        projects: listMockProjects({ status, limit })
      })
  );

  server.tool(
    "get_server_status",
    "Return server version, environment, read-only mode and public base URL.",
    {},
    async () =>
      jsonToolResponse({
        ...getHealthPayload(config),
        name: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: config.NODE_ENV,
        publicBaseUrl: config.PUBLIC_BASE_URL,
        mcpEndpoint: `${config.PUBLIC_BASE_URL.replace(/\/$/, "")}/mcp`,
        authentication: config.MCP_BEARER_TOKEN ? "bearer_token_enabled" : "not_configured"
      })
  );
}
