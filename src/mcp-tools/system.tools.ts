import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { isDatabaseUrlConfigured } from "../config/database.js";
import { getHealthPayload } from "../server/health.js";
import { jsonToolResponse } from "./response.js";

export function registerSystemTools(server: McpServer, context: AppContext) {
  server.tool("ping", "Health probe for the Agency SEO/GEO MCP server.", {}, async () =>
    jsonToolResponse({
      ok: true,
      message: "pong",
      timestamp: new Date().toISOString()
    })
  );

  server.tool(
    "get_server_status",
    "Return server version, environment, read-only mode, auth status and public base URL.",
    {},
    async () =>
      jsonToolResponse({
        ...getHealthPayload(context.config),
        name: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: context.config.NODE_ENV,
        publicBaseUrl: context.config.PUBLIC_BASE_URL,
        mcpEndpoint: `${context.config.PUBLIC_BASE_URL.replace(/\/$/, "")}/mcp`,
        authentication: context.config.MCP_BEARER_TOKEN ? "bearer_token_enabled" : "not_configured",
        database: isDatabaseUrlConfigured(context.config.DATABASE_URL) ? "configured" : "not_configured"
      })
  );
}
