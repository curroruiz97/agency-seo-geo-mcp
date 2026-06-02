import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // src/config/env.ts evaluates loadConfig() at import time. Keep auth
    // optional in the test process so importing modules never throws; tests
    // that exercise auth pass an explicit config source to loadConfig().
    env: {
      NODE_ENV: "test",
      REQUIRE_MCP_AUTH: "false"
    }
  }
});
