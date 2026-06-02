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
import { registerHealthTools } from "./health.tools.js";

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

const readOnlyPrefixes = ["get_", "list_", "gsc_get_", "gsc_list_", "ga_get_", "ga_list_", "seranking_get_", "check_"];
const readOnlyNames = new Set([
  "ping", "get_server_status", "list_projects", "list_sites", "search", "fetch",
  "list_change_requests", "list_opportunities", "list_extraction_runs",
  "check_site_health", "check_all_sites_health"
]);

// Tools that perform real, hard-to-reverse writes on external systems.
const destructiveNames = new Set(["execute_change_request"]);

// Tools that reach external systems (WordPress, RankMath, SE Ranking, Google,
// Anthropic) — directly or by applying an approved change. Registry/discovery
// reads that only touch our own database are NOT open-world.
const openWorldPrefixes = ["gsc_", "ga_", "seranking_"];
const openWorldNames = new Set([
  "get_post", "list_posts", "list_pages", "get_categories", "get_tags",
  "get_rankmath_metadata", "get_focus_keywords", "get_schema_config", "get_redirections",
  "create_post", "update_post", "update_page", "upload_media", "create_redirection",
  "update_rankmath_metadata", "update_focus_keywords", "update_schema_config",
  "check_site_health", "check_all_sites_health",
  "ingest_project", "ingest_all_projects",
  "run_pipeline_for_project", "run_pipeline_all_projects",
  "register_seranking_key", "fill_content_draft", "execute_change_request"
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
  registerHealthTools(server, context);
  normalizeToolDescriptors(server);
}

function isReadOnlyTool(name: string) {
  return readOnlyNames.has(name) || readOnlyPrefixes.some((prefix) => name.startsWith(prefix));
}

function isDestructiveTool(name: string) {
  return destructiveNames.has(name);
}

function isOpenWorldTool(name: string) {
  return openWorldNames.has(name) || openWorldPrefixes.some((prefix) => name.startsWith(prefix));
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
      destructiveHint: isDestructiveTool(name),
      openWorldHint: isOpenWorldTool(name),
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
