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
  REQUIRE_MCP_AUTH: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  MCP_BEARER_TOKEN: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().optional().default(""),
  DIRECT_DATABASE_URL: z.string().optional().default("")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = envSchema.parse(source);

  if (config.REQUIRE_MCP_AUTH && !config.MCP_BEARER_TOKEN) {
    throw new Error("MCP_BEARER_TOKEN is required when REQUIRE_MCP_AUTH=true.");
  }

  return config;
}

export const config = loadConfig();
