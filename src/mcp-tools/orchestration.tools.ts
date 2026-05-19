import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { jsonToolResponse } from "./response.js";

/**
 * Orchestration tools: high-level pipelines that chain extract → strategy → execute.
 * These are the entry points Claude (or any MCP client) will call.
 */

export function registerOrchestrationTools(server: McpServer, context: AppContext) {
  server.tool(
    "ingest_project",
    "Extrae datos SEO de SE Ranking para un proyecto (keywords, posiciones, audit, competitors) y los persiste en la base de datos. Devuelve estadísticas del run.",
    { project_id: z.string().uuid() },
    async ({ project_id }) => {
      if (!context.services?.extract) {
        return jsonToolResponse({ ok: false, error: "extract_service_not_available", hint: "DATABASE_URL must be configured." });
      }
      try {
        const { stats } = await context.services.extract.runForProject(project_id);
        return jsonToolResponse({ ok: true, project_id, stats });
      } catch (err) {
        return jsonToolResponse({ ok: false, project_id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  server.tool(
    "ingest_all_projects",
    "Ejecuta ingest_project en todos los proyectos activos en serie. Devuelve un array con un resultado por proyecto. Útil como cron diario/semanal.",
    {},
    async () => {
      if (!context.services?.extract) {
        return jsonToolResponse({ ok: false, error: "extract_service_not_available" });
      }
      const results = await context.services.extract.runForAllActiveProjects();
      return jsonToolResponse({ ok: true, count: results.length, results });
    }
  );

  server.tool(
    "generate_strategy",
    "A partir de los datos ya ingestados, genera Opportunities y ChangeRequests priorizados para un proyecto. Idempotente: re-ejecutar suma nuevas oportunidades, no duplica las existentes.",
    { project_id: z.string().uuid() },
    async ({ project_id }) => {
      if (!context.services?.strategy) {
        return jsonToolResponse({ ok: false, error: "strategy_service_not_available" });
      }
      try {
        const result = await context.services.strategy.generateForProject(project_id);
        return jsonToolResponse({ ok: true, project_id, ...result });
      } catch (err) {
        return jsonToolResponse({ ok: false, project_id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  server.tool(
    "generate_strategy_all_projects",
    "Genera estrategia (Opportunities + ChangeRequests) para todos los proyectos activos.",
    {},
    async () => {
      if (!context.services?.strategy) {
        return jsonToolResponse({ ok: false, error: "strategy_service_not_available" });
      }
      const results = await context.services.strategy.generateForAllActiveProjects();
      return jsonToolResponse({ ok: true, count: results.length, results });
    }
  );

  server.tool(
    "run_pipeline_for_project",
    "Pipeline completo (extract + strategy) para un solo proyecto. No ejecuta cambios automáticamente; solo genera propuestas que requieren aprobación.",
    { project_id: z.string().uuid() },
    async ({ project_id }) => {
      if (!context.services?.extract || !context.services?.strategy) {
        return jsonToolResponse({ ok: false, error: "services_not_available" });
      }
      const extractResult = await context.services.extract.runForProject(project_id);
      const strategyResult = await context.services.strategy.generateForProject(project_id);
      return jsonToolResponse({
        ok: true,
        project_id,
        extract: extractResult.stats,
        strategy: strategyResult
      });
    }
  );

  server.tool(
    "run_pipeline_all_projects",
    "Pipeline completo extract + strategy para TODOS los proyectos activos. Pensado para ejecutarse vía cron/scheduled-task semanal.",
    {},
    async () => {
      if (!context.services?.extract || !context.services?.strategy) {
        return jsonToolResponse({ ok: false, error: "services_not_available" });
      }
      const extracts = await context.services.extract.runForAllActiveProjects();
      const strategies = await context.services.strategy.generateForAllActiveProjects();
      return jsonToolResponse({
        ok: true,
        projects_extracted: extracts.length,
        projects_strategised: strategies.length,
        extracts,
        strategies
      });
    }
  );
}
