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
      LOG_LEVEL: "silent"
    });

    expect(config.PORT).toBe(3010);
    expect(config.READ_ONLY_MODE).toBe(true);
    expect(config.ALLOWED_ORIGINS).toEqual(["https://chatgpt.com", "https://chat.openai.com"]);
  });
});
