import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { AVENUE_AI_WIDGET_URI } from "../app-ui/avenueAppResource.js";
import { registerGoogleAnalyticsTools, registerGoogleSearchConsoleTools } from "./google.tools.js";
import { registerKnowledgeTools } from "./knowledge.tools.js";
import { registerProjectTools } from "./projects.tools.js";
import { registerRankMathTools } from "./rankmath.tools.js";
import { registerSerankingTools } from "./seranking.tools.js";
import { registerSystemTools } from "./system.tools.js";
import { registerWordPressTools } from "./wordpress.tools.js";
import { registerOrchestrationTools } from "./orchestration.tools.js";
import { registerChangeRequestTools } from "./changeRequests.tools.js";

interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
  idempotentHint?: boolean;
}

interface InternalRegisteredTool {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: Partial<ToolAnnotations>;
  execution?: unknown;
  _meta?: Record<string, unknown>;
}

const genericOutputSchema = z.object({}).passthrough();

const acronymTitles: Record<string, string> = {
  ga: "GA",
  geo: "GEO",
  gsc: "GSC",
  mcp: "MCP",
  seo: "SEO",
  seranking: "SE Ranking",
  rankmath: "Rank Math"
};

const readOnlyPrefixes = ["get_", "list_", "gsc_get_", "gsc_list_", "ga_get_", "ga_list_", "seranking_get_"];
const readOnlyNames = new Set([
  "ping", "get_server_status", "list_projects", "list_sites", "search", "fetch",
  "list_change_requests", "list_opportunities", "list_extraction_runs"
]);

export function registerTools(server: McpServer, context: AppContext) {
  registerSystemTools(server, context);
  registerKnowledgeTools(server, context);
  registerProjectTools(server, context);
  registerWordPressTools(server, context);
  registerRankMathTools(server, context);
  registerSerankingTools(server, context);
  registerGoogleSearchConsoleTools(server, context);
  registerGoogleAnalyticsTools(server, context);
  registerOrchestrationTools(server, context);
  registerChangeRequestTools(server, context);
  normalizeToolDescriptors(server);
}

function isReadOnlyTool(name: string) {
  return readOnlyNames.has(name) || readOnlyPrefixes.some((prefix) => name.startsWith(prefix));
}

function titleFromName(name: string) {
  return name
    .split("_")
    .map((part) => acronymTitles[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeToolDescriptors(server: McpServer) {
  const registered = (server as unknown as { _registeredTools?: Record<string, InternalRegisteredTool> })._registeredTools;
  if (!registered) {
    return;
  }

  for (const [name, tool] of Object.entries(registered)) {
    const readOnly = isReadOnlyTool(name);

    tool.title ??= titleFromName(name);
    tool.outputSchema ??= genericOutputSchema;
    tool.annotations = {
      readOnlyHint: readOnly,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: readOnly,
      ...tool.annotations
    };
    const existingMeta = tool._meta ?? {};
    const existingUi =
      existingMeta.ui && typeof existingMeta.ui === "object" && !Array.isArray(existingMeta.ui)
        ? (existingMeta.ui as Record<string, unknown>)
        : {};

    tool._meta = {
      ...existingMeta,
      ui: {
        resourceUri: AVENUE_AI_WIDGET_URI,
        visibility: ["model", "app"],
        ...existingUi
      },
      "ui/resourceUri": existingMeta["ui/resourceUri"] ?? AVENUE_AI_WIDGET_URI,
      "openai/outputTemplate": existingMeta["openai/outputTemplate"] ?? AVENUE_AI_WIDGET_URI,
      "openai/toolInvocation/invoking":
        existingMeta["openai/toolInvocation/invoking"] ?? (readOnly ? "Consultando datos" : "Creando propuesta"),
      "openai/toolInvocation/invoked":
        existingMeta["openai/toolInvocation/invoked"] ?? (readOnly ? "Datos consultados" : "Propuesta creada")
    };

    delete tool.execution;
  }
}
