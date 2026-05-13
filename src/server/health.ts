import type { AppConfig } from "../config/env.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";

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
