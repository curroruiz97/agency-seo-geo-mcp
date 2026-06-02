import { afterAll, describe, expect, it } from "vitest";
import { createAppContext } from "../src/app/appContext.js";
import { AVENUE_AI_WIDGET_URI } from "../src/app-ui/avenueAppResource.js";
import { loadConfig } from "../src/config/env.js";
import { createMcpServer } from "../src/server/mcp.js";

interface RegisteredTool {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
    idempotentHint?: boolean;
  };
  execution?: unknown;
  _meta?: Record<string, unknown>;
}

const config = loadConfig({
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "3010",
  PUBLIC_BASE_URL: "https://lava.avenuemedia.io",
  READ_ONLY_MODE: "true",
  ALLOWED_ORIGINS: "https://chatgpt.com,https://chat.openai.com",
  REQUIRE_MCP_AUTH: "false",
  LOG_LEVEL: "silent",
  DATABASE_URL: "",
  DIRECT_URL: ""
});

const context = createAppContext(config);
const server = createMcpServer(context);
const registeredTools = (server as unknown as { _registeredTools?: Record<string, RegisteredTool> })._registeredTools ?? {};
const registeredResources = (server as unknown as { _registeredResources?: Record<string, unknown> })._registeredResources ?? {};

describe("MCP tool descriptors", () => {
  afterAll(async () => {
    await server.close();
  });

  it("publishes the expected action surface for ChatGPT Builder", () => {
    expect(Object.keys(registeredTools).length).toBeGreaterThanOrEqual(41);
    expect(registeredTools).toHaveProperty("ping");
    expect(registeredTools).toHaveProperty("search");
    expect(registeredTools).toHaveProperty("fetch");
    expect(registeredTools).toHaveProperty("list_projects");
    expect(registeredTools).toHaveProperty("update_post");
    expect(registeredTools).toHaveProperty("gsc_get_search_performance");
  });

  it("adds required ChatGPT-compatible metadata to every tool", () => {
    for (const [name, tool] of Object.entries(registeredTools)) {
      expect(tool.title, `${name} title`).toEqual(expect.any(String));
      expect(tool.description, `${name} description`).toEqual(expect.any(String));
      expect(tool.inputSchema, `${name} input schema`).toBeDefined();
      expect(tool.outputSchema, `${name} output schema`).toBeDefined();
      expect(tool.annotations?.readOnlyHint, `${name} readOnlyHint`).toEqual(expect.any(Boolean));
      expect(tool.annotations?.destructiveHint, `${name} destructiveHint`).toEqual(expect.any(Boolean));
      expect(tool.annotations?.openWorldHint, `${name} openWorldHint`).toEqual(expect.any(Boolean));
      expect(tool._meta?.["openai/toolInvocation/invoking"], `${name} invoking meta`).toEqual(expect.any(String));
      expect(tool._meta?.["openai/toolInvocation/invoked"], `${name} invoked meta`).toEqual(expect.any(String));
      expect(tool._meta?.["openai/outputTemplate"], `${name} output template`).toBe(AVENUE_AI_WIDGET_URI);
      expect((tool._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri, `${name} ui resource`).toBe(
        AVENUE_AI_WIDGET_URI
      );
      expect(tool.execution, `${name} execution descriptor`).toBeUndefined();
    }
  });

  it("marks reads and proposal writes with different impact hints", () => {
    expect(registeredTools.list_projects?.annotations?.readOnlyHint).toBe(true);
    expect(registeredTools.gsc_get_search_performance?.annotations?.readOnlyHint).toBe(true);
    expect(registeredTools.update_post?.annotations?.readOnlyHint).toBe(false);
    expect(registeredTools.create_redirection?.annotations?.readOnlyHint).toBe(false);
  });

  it("flags the executor as destructive and external-facing tools as open-world", () => {
    expect(registeredTools.execute_change_request?.annotations?.destructiveHint).toBe(true);
    expect(registeredTools.ping?.annotations?.destructiveHint).toBe(false);
    expect(registeredTools.gsc_get_search_performance?.annotations?.openWorldHint).toBe(true);
    expect(registeredTools.execute_change_request?.annotations?.openWorldHint).toBe(true);
    expect(registeredTools.list_projects?.annotations?.openWorldHint).toBe(false);
  });

  it("registers the Avenue AI app resource used by tool descriptors", () => {
    expect(Object.keys(registeredResources).length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(registeredResources)).toContain(AVENUE_AI_WIDGET_URI);
  });
});
