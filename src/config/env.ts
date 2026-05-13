import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("https://mcp.tudominio.com"),
  READ_ONLY_MODE: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  ALLOWED_ORIGINS: z
    .string()
    .default("https://chatgpt.com,https://chat.openai.com")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  MCP_BEARER_TOKEN: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(source);
}

export const config = loadConfig();
