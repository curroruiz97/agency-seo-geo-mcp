import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { jsonToolResponse } from "./response.js";

/**
 * ChangeRequest review/approval/execution tools.
 *
 * Workflow exposed to MCP clients:
 *   1. list_change_requests (filter by status, project)
 *   2. approve_change_request (status proposed → approved)
 *   3. execute_change_request (status approved → applied via ExecuteService)
 *   4. reject_change_request (status → rejected)
 */

export function registerChangeRequestTools(server: McpServer, context: AppContext) {
  server.tool(
    "list_change_requests",
    "Lista las solicitudes de cambio (ChangeRequest) filtradas por proyecto, estado o tipo. Devuelve hasta 100 elementos.",
    {
      project_id: z.string().uuid().optional(),
      status: z.enum(["proposed", "approved", "applied", "verified", "rejected", "failed", "rolled_back"]).optional(),
      change_type: z.string().optional(),
      risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
      limit: z.number().int().positive().max(100).optional().default(50)
    },
    async ({ project_id, status, change_type, risk_level, limit }) => {
      const prisma = context.prisma;
      if (!prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });

      const list = await prisma.changeRequest.findMany({
        where: {
          projectId: project_id,
          status,
          changeType: change_type,
          riskLevel: risk_level
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });
      return jsonToolResponse({ ok: true, count: list.length, items: list });
    }
  );

  server.tool(
    "approve_change_request",
    "Aprueba una ChangeRequest. Pasa el estado de 'proposed' a 'approved'. Requiere `approved_by` (email o id de usuario).",
    {
      change_request_id: z.string().uuid(),
      approved_by: z.string().min(1)
    },
    async ({ change_request_id, approved_by }) => {
      const prisma = context.prisma;
      if (!prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      try {
        const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: change_request_id } });
        if (cr.status !== "proposed") {
          return jsonToolResponse({ ok: false, error: `cannot_approve_status_${cr.status}` });
        }
        const updated = await prisma.changeRequest.update({
          where: { id: change_request_id },
          data: { status: "approved", approvedBy: approved_by, approvedAt: new Date() }
        });
        return jsonToolResponse({ ok: true, change_request: updated });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  server.tool(
    "reject_change_request",
    "Rechaza una ChangeRequest pendiente. Estado pasa de 'proposed' a 'rejected'.",
    {
      change_request_id: z.string().uuid(),
      reason: z.string().min(1).optional()
    },
    async ({ change_request_id, reason }) => {
      const prisma = context.prisma;
      if (!prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const updated = await prisma.changeRequest.update({
        where: { id: change_request_id },
        data: { status: "rejected", reason: reason ?? null }
      });
      return jsonToolResponse({ ok: true, change_request: updated });
    }
  );

  server.tool(
    "execute_change_request",
    "Ejecuta una ChangeRequest aprobada vía WordPress/RankMath/Elementor. La ChangeRequest debe estar en estado 'approved'. Devuelve resultado de la aplicación o error.",
    { change_request_id: z.string().uuid() },
    async ({ change_request_id }) => {
      if (!context.services?.execute) {
        return jsonToolResponse({ ok: false, error: "execute_service_not_available" });
      }
      const result = await context.services.execute.applyApprovedRequest(change_request_id);
      return jsonToolResponse(result);
    }
  );

  server.tool(
    "list_opportunities",
    "Lista las oportunidades SEO detectadas, ordenadas por priorityScore desc. Útil para ver el backlog priorizado.",
    {
      project_id: z.string().uuid().optional(),
      status: z.enum(["open", "proposed", "in_progress", "closed", "dismissed"]).optional().default("open"),
      limit: z.number().int().positive().max(100).optional().default(50)
    },
    async ({ project_id, status, limit }) => {
      const prisma = context.prisma;
      if (!prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const list = await prisma.opportunity.findMany({
        where: { projectId: project_id, status },
        orderBy: { priorityScore: "desc" },
        take: limit
      });
      return jsonToolResponse({ ok: true, count: list.length, items: list });
    }
  );

  server.tool(
    "list_extraction_runs",
    "Historial de runs de extracción de datos por proyecto, con stats y errores.",
    {
      project_id: z.string().uuid().optional(),
      status: z.enum(["pending", "running", "completed", "failed"]).optional(),
      limit: z.number().int().positive().max(100).optional().default(20)
    },
    async ({ project_id, status, limit }) => {
      const prisma = context.prisma;
      if (!prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const list = await prisma.extractionRun.findMany({
        where: { projectId: project_id, status },
        orderBy: { startedAt: "desc" },
        take: limit
      });
      return jsonToolResponse({ ok: true, count: list.length, items: list });
    }
  );
}
