import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { registerGoogleAnalyticsTools, registerGoogleSearchConsoleTools } from "./google.tools.js";
import { registerProjectTools } from "./projects.tools.js";
import { registerRankMathTools } from "./rankmath.tools.js";
import { registerSerankingTools } from "./seranking.tools.js";
import { registerSystemTools } from "./system.tools.js";
import { registerWordPressTools } from "./wordpress.tools.js";

export function registerTools(server: McpServer, context: AppContext) {
  registerSystemTools(server, context);
  registerProjectTools(server, context);
  registerWordPressTools(server, context);
  registerRankMathTools(server, context);
  registerSerankingTools(server, context);
  registerGoogleSearchConsoleTools(server, context);
  registerGoogleAnalyticsTools(server, context);
}
