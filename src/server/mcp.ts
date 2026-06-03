import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { AppContext } from "../app/appContext.js";
import { registerAvenueAppResource } from "../app-ui/avenueAppResource.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../config/constants.js";
import { registerTools } from "../mcp-tools/register.js";

export function createMcpServer(context: AppContext) {
  const server = new McpServer({
    name: SERVICE_NAME,
    version: SERVICE_VERSION
  });

  if (context.config.APP_WIDGET_ENABLED) {
    registerAvenueAppResource(server, context.config);
  }
  registerTools(server, context);

  return server;
}

export async function handleMcpRequest(context: AppContext, req: Request, res: Response) {
  const server = createMcpServer(context);
  // Force Accept header so SDK's strict negotiation accepts any MCP client
  req.headers["accept"] = "application/json, text/event-stream";
  // The MCP SDK reads the Accept header from req.rawHeaders when converting
  // the Node request into a Web Request, so we also normalise rawHeaders here.
  const rh = (req as unknown as { rawHeaders?: string[] }).rawHeaders;
  if (Array.isArray(rh)) {
    let found = false;
    for (let i = 0; i < rh.length; i += 2) {
      if (rh[i] && rh[i].toLowerCase() === "accept") { rh[i + 1] = "application/json, text/event-stream"; found = true; }
    }
    if (!found) { rh.push("accept", "application/json, text/event-stream"); }
  }
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
