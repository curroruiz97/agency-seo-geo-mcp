import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireMcpBearerToken } from "../src/server/security.js";

function createRequest(method: string, body: unknown, authorization?: string): Request {
  return {
    method,
    body,
    header(name: string) {
      if (name.toLowerCase() === "authorization") {
        return authorization;
      }
      return undefined;
    }
  } as Request;
}

function createResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return res as unknown as Response & typeof res;
}

describe("MCP bearer auth", () => {
  const config = {
    MCP_BEARER_TOKEN: "secret-token",
    ALLOW_PUBLIC_MCP_DISCOVERY: true,
    REQUIRE_MCP_AUTH: true
  };

  it("allows unauthenticated tools/list discovery when enabled", () => {
    const req = createRequest("POST", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireMcpBearerToken(config)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("allows unauthenticated app resource reads when public discovery is enabled", () => {
    const req = createRequest("POST", {
      jsonrpc: "2.0",
      id: 3,
      method: "resources/read",
      params: { uri: "ui://widget/avenue-ai-v1.html" }
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireMcpBearerToken(config)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("keeps tool calls protected without a valid token", () => {
    const req = createRequest("POST", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "ping", arguments: {} }
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireMcpBearerToken(config)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthorized" });
  });

  it("allows tool calls with the configured bearer token", () => {
    const req = createRequest(
      "POST",
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } },
      "Bearer secret-token"
    );
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireMcpBearerToken(config)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed when no token is configured but auth is required", () => {
    const noTokenConfig = { MCP_BEARER_TOKEN: "", ALLOW_PUBLIC_MCP_DISCOVERY: true, REQUIRE_MCP_AUTH: true };
    const req = createRequest("POST", { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ping" } });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireMcpBearerToken(noTokenConfig)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: "auth_misconfigured" });
  });

  it("stays open only when auth is explicitly disabled (dev/local)", () => {
    const openConfig = { MCP_BEARER_TOKEN: "", ALLOW_PUBLIC_MCP_DISCOVERY: true, REQUIRE_MCP_AUTH: false };
    const req = createRequest("POST", { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "ping" } });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireMcpBearerToken(openConfig)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
