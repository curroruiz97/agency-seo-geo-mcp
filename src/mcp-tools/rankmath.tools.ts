import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { createProposedChange, integrationNotConfigured, optionalText, siteId } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";

const objectType = z.enum(["post", "page"]).describe("WordPress object type.");

export function registerRankMathTools(server: McpServer, context: AppContext) {
  server.tool(
    "get_rankmath_metadata",
    "Lee title SEO, meta description, focus keywords y metadatos Rank Math para un post o pagina.",
    { site_id: siteId, object_type: objectType, object_id: z.string().min(1) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "rank_math", "get_rankmath_metadata", input))
  );

  server.tool(
    "update_rankmath_metadata",
    "Crea una propuesta interna para actualizar title SEO, meta description, focus keywords y schema de Rank Math.",
    {
      site_id: siteId,
      object_type: objectType,
      object_id: z.string().min(1),
      seo_title: optionalText,
      meta_description: optionalText,
      focus_keywords: z.array(z.string().min(1)).optional(),
      schema_type: optionalText
    },
    async ({ site_id, object_type, object_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "rankmath_update_metadata",
          targetEntityType: `rankmath_${object_type}`,
          targetEntityId: object_id,
          riskLevel: "low",
          afterPayload: payload,
          reason: "Requested through MCP update_rankmath_metadata."
        })
      )
  );

  server.tool(
    "get_focus_keywords",
    "Lee las focus keywords de Rank Math para un post o pagina.",
    { site_id: siteId, object_type: objectType, object_id: z.string().min(1) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "rank_math", "get_focus_keywords", input))
  );

  server.tool(
    "update_focus_keywords",
    "Crea una propuesta interna para actualizar las focus keywords de Rank Math.",
    {
      site_id: siteId,
      object_type: objectType,
      object_id: z.string().min(1),
      focus_keywords: z.array(z.string().min(1)).min(1)
    },
    async ({ site_id, object_type, object_id, focus_keywords }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "rankmath_update_focus_keywords",
          targetEntityType: `rankmath_${object_type}`,
          targetEntityId: object_id,
          riskLevel: "low",
          afterPayload: { focus_keywords },
          reason: "Requested through MCP update_focus_keywords."
        })
      )
  );

  server.tool(
    "get_schema_config",
    "Lee la configuracion schema SEO de Rank Math para un post o pagina.",
    { site_id: siteId, object_type: objectType, object_id: z.string().min(1) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "rank_math", "get_schema_config", input))
  );

  server.tool(
    "update_schema_config",
    "Crea una propuesta interna para actualizar la configuracion schema de Rank Math.",
    {
      site_id: siteId,
      object_type: objectType,
      object_id: z.string().min(1),
      schema_type: z.string().min(1),
      schema_payload: z.record(z.unknown()).optional()
    },
    async ({ site_id, object_type, object_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "rankmath_update_schema_config",
          targetEntityType: `rankmath_${object_type}`,
          targetEntityId: object_id,
          riskLevel: "medium",
          afterPayload: payload,
          reason: "Requested through MCP update_schema_config."
        })
      )
  );

  server.tool(
    "get_redirections",
    "Lista redirecciones configuradas en Rank Math.",
    { site_id: siteId, limit: z.number().int().positive().max(100).optional().default(50) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "rank_math", "get_redirections", input))
  );

  server.tool(
    "create_redirection",
    "Crea una propuesta interna para crear una redireccion. No modifica Rank Math sin aprobacion humana.",
    {
      site_id: siteId,
      source_url: z.string().min(1),
      destination_url: z.string().min(1),
      status_code: z.enum(["301", "302", "307", "308"]).optional().default("301")
    },
    async ({ site_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "rankmath_create_redirection",
          targetEntityType: "rankmath_redirection",
          riskLevel: "high",
          afterPayload: payload,
          reason: "Requested through MCP create_redirection."
        })
      )
  );
}
