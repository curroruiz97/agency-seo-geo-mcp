import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { AppContext } from "../app/appContext.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { registerTools } from "../mcp-tools/register.js";

export function createMcpServer(context: AppContext) {
  const server = new McpServer({
    name: SERVICE_NAME,
    version: SERVICE_VERSION
  });

  registerTools(server, context);

  return server;
}

export async function handleMcpRequest(context: AppContext, req: Request, res: Response) {
  const server = createMcpServer(context);
  // Force Accept header so SDK's strict negotiation accepts any MCP client
  req.headers["accept"] = "application/json, text/event-stream";
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
