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
