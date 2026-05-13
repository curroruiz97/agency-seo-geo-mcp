import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { AppConfig } from "../config/env.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { registerTools } from "../mcp-tools/register.js";

export function createMcpServer(config: AppConfig) {
  const server = new McpServer({
    name: SERVICE_NAME,
    version: SERVICE_VERSION
  });

  registerTools(server, config);

  return server;
}

export async function handleMcpRequest(config: AppConfig, req: Request, res: Response) {
  const server = createMcpServer(config);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
