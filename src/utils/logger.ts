import pino from "pino";
import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "../config/env.js";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "req.headers['x-auth-token']",
  "res.headers['set-cookie']",
  "*.password",
  "*.applicationPassword",
  "*.token",
  "*.bridgeToken",
  "*.secret",
  "*.apiKey",
  "*.encryptedPayload"
];

export function createLogger(config: Pick<AppConfig, "LOG_LEVEL">) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: redactPaths,
      censor: "[redacted]"
    }
  });
}

export function createHttpLogger(config: Pick<AppConfig, "LOG_LEVEL">) {
  return pinoHttp({
    logger: createLogger(config),
    redact: {
      paths: redactPaths,
      censor: "[redacted]"
    },
    customLogLevel(_req: IncomingMessage, res: ServerResponse, err?: Error) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    }
  });
}
