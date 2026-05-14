import type { AppConfig } from "../config/env.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { isDatabaseUrlConfigured } from "../config/database.js";

export interface HealthPayload {
  status: "ok";
  service: string;
  version: string;
  readOnly: boolean;
  timestamp: string;
}

export function getHealthPayload(config: Pick<AppConfig, "READ_ONLY_MODE">): HealthPayload {
  return {
    status: "ok",
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    readOnly: config.READ_ONLY_MODE,
    timestamp: new Date().toISOString()
  };
}

export interface RootPayload {
  status: "ok";
  service: string;
  version: string;
  message: string;
  readOnly: boolean;
  endpoints: {
    health: string;
    ready: string;
    version: string;
    mcp: string;
  };
  mcp: {
    transport: "streamable_http";
    method: "JSON-RPC 2.0";
    discovery: "tools/list";
  };
  timestamp: string;
}

export function getRootPayload(config: Pick<AppConfig, "PUBLIC_BASE_URL" | "READ_ONLY_MODE">): RootPayload {
  const baseUrl = config.PUBLIC_BASE_URL.replace(/\/$/, "");

  return {
    status: "ok",
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    message: "Agency SEO/GEO MCP server is running. Connect MCP clients to the /mcp endpoint.",
    readOnly: config.READ_ONLY_MODE,
    endpoints: {
      health: `${baseUrl}/health`,
      ready: `${baseUrl}/ready`,
      version: `${baseUrl}/version`,
      mcp: `${baseUrl}/mcp`
    },
    mcp: {
      transport: "streamable_http",
      method: "JSON-RPC 2.0",
      discovery: "tools/list"
    },
    timestamp: new Date().toISOString()
  };
}

export interface ReadinessPayload {
  status: "ready";
  database: "configured" | "not_configured";
  timestamp: string;
}

export function getReadinessPayload(config: Pick<AppConfig, "DATABASE_URL">): ReadinessPayload {
  return {
    status: "ready",
    database: isDatabaseUrlConfigured(config.DATABASE_URL) ? "configured" : "not_configured",
    timestamp: new Date().toISOString()
  };
}
