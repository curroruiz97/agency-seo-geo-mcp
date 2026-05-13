import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { jsonToolResponse } from "./response.js";

export function registerProjectTools(server: McpServer, context: AppContext) {
  server.tool(
    "list_projects",
    "List agency projects. Sprint 1.5 uses mock data and never returns credentials or real customer secrets.",
    {
      status: z.enum(["active", "paused", "all"]).optional().default("active"),
      limit: z.number().int().positive().max(50).optional().default(50)
    },
    async ({ status, limit }) => {
      const projects = await context.repositories.projects.list({ status, limit });

      return jsonToolResponse({
        projects
      });
    }
  );
}
