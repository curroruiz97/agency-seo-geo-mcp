import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("https://mcp.tudominio.com"),
  READ_ONLY_MODE: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  ALLOWED_ORIGINS: z
    .string()
    .default("https://chatgpt.com,https://chat.openai.com,https://claude.ai,https://claude.com")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  REQUIRE_MCP_AUTH: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  ALLOW_PUBLIC_MCP_DISCOVERY: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  // ChatGPT Apps widget UI. OFF by default because its ui.domain is rejected by
  // Claude ("Invalid ui.domain format: expected {hash}.claudemcpcontent.com"),
  // which breaks the Claude connector UI. Enable only when serving ChatGPT Apps.
  APP_WIDGET_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  MCP_BEARER_TOKEN: z.string().optional().default(""),
  // When set, enables the OAuth flow (Dynamic Client Registration + Authorization
  // Code + PKCE) so Claude.ai's connector can authenticate. This value is the
  // shared password shown on the /authorize login page. The static MCP_BEARER_TOKEN
  // keeps working in parallel (ChatGPT / curl / the WordPress plugin).
  MCP_OAUTH_PASSWORD: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().optional().default(""),
  DIRECT_URL: z.string().optional().default(""),
  DIRECT_DATABASE_URL: z.string().optional().default(""),
  SECRETS_MASTER_KEY: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().optional().default("claude-sonnet-4-6")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = envSchema.parse(source);

  if (config.REQUIRE_MCP_AUTH && !config.MCP_BEARER_TOKEN) {
    throw new Error("MCP_BEARER_TOKEN is required when REQUIRE_MCP_AUTH=true.");
  }

  // Defence in depth: never allow an unauthenticated /mcp endpoint in production,
  // even if REQUIRE_MCP_AUTH was explicitly turned off.
  if (config.NODE_ENV === "production" && !config.MCP_BEARER_TOKEN) {
    throw new Error(
      "MCP_BEARER_TOKEN must be set in production. Refusing to start an unauthenticated /mcp endpoint."
    );
  }

  return config;
}

export const config = loadConfig();
