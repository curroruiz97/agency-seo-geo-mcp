import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { dateString, integrationNotConfigured, siteId } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";

export function registerSerankingTools(server: McpServer, context: AppContext) {
  server.tool("seranking_get_projects", "Lista proyectos conocidos para mapearlos con SE Ranking.", {}, async () => {
    const projects = await context.repositories.projects.list({ status: "active", limit: 50 });
    return jsonToolResponse({ projects });
  });

  server.tool(
    "seranking_get_rankings",
    "Devuelve rankings de keywords por proyecto desde SE Ranking cuando la integracion este configurada.",
    { project_id: siteId, date: dateString.optional(), limit: z.number().int().positive().max(500).optional().default(100) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "seranking", "seranking_get_rankings", input))
  );

  server.tool(
    "seranking_get_keyword_positions",
    "Devuelve posiciones de keywords concretas por proyecto desde SE Ranking.",
    {
      project_id: siteId,
      keywords: z.array(z.string().min(1)).optional(),
      date: dateString.optional(),
      device: z.enum(["desktop", "mobile"]).optional(),
      location: z.string().optional()
    },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "seranking", "seranking_get_keyword_positions", input))
  );

  server.tool(
    "seranking_get_competitors",
    "Devuelve competidores organicos de un proyecto desde SE Ranking.",
    { project_id: siteId },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "seranking", "seranking_get_competitors", input))
  );

  server.tool(
    "seranking_get_site_audit",
    "Devuelve auditoria tecnica del sitio desde SE Ranking.",
    { project_id: siteId },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "seranking", "seranking_get_site_audit", input))
  );

  server.tool(
    "seranking_get_backlinks",
    "Devuelve resumen de backlinks desde SE Ranking.",
    { project_id: siteId },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "seranking", "seranking_get_backlinks", input))
  );
}
