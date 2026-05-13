import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { registerProjectTools } from "./projects.tools.js";
import { registerSystemTools } from "./system.tools.js";

export function registerTools(server: McpServer, context: AppContext) {
  registerSystemTools(server, context);
  registerProjectTools(server, context);
}
