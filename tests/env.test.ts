import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

describe("environment config", () => {
  it("parses read-only mode and allowed origins", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "3010",
      PUBLIC_BASE_URL: "https://mcp.tudominio.com",
      READ_ONLY_MODE: "true",
      ALLOWED_ORIGINS: "https://chatgpt.com, https://chat.openai.com",
      REQUIRE_MCP_AUTH: "false",
      LOG_LEVEL: "silent"
    });

    expect(config.PORT).toBe(3010);
    expect(config.READ_ONLY_MODE).toBe(true);
    expect(config.REQUIRE_MCP_AUTH).toBe(false);
    expect(config.ALLOWED_ORIGINS).toEqual(["https://chatgpt.com", "https://chat.openai.com"]);
  });

  it("requires an MCP bearer token when auth is mandatory", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        PORT: "3000",
        PUBLIC_BASE_URL: "https://mcp.tudominio.com",
        READ_ONLY_MODE: "true",
        ALLOWED_ORIGINS: "https://chatgpt.com",
        REQUIRE_MCP_AUTH: "true",
        LOG_LEVEL: "silent"
      })
    ).toThrow("MCP_BEARER_TOKEN is required");
  });
});
