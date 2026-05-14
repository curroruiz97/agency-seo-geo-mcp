import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { createProposedChange, integrationNotConfigured, optionalText, siteId } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";

export function registerWordPressTools(server: McpServer, context: AppContext) {
  server.tool("list_sites", "Lista los sitios/proyectos disponibles en el registro de la agencia.", {}, async () => {
    const sites = await context.repositories.projects.list({ status: "active", limit: 50 });
    return jsonToolResponse({ sites });
  });

  server.tool(
    "get_post",
    "Obtiene una entrada de WordPress por site_id y post_id. Actualmente devuelve estado de integracion hasta configurar credenciales WordPress.",
    { site_id: siteId(), post_id: z.string().min(1) },
    async ({ site_id, post_id }) =>
      jsonToolResponse(integrationNotConfigured(context, "wordpress", "get_post", { site_id, post_id }))
  );

  server.tool(
    "list_posts",
    "Lista entradas de WordPress para un sitio. Actualmente publica la accion y devuelve estado hasta configurar WordPress read-only.",
    {
      site_id: siteId(),
      status: z.enum(["publish", "draft", "private", "any"]).optional().default("publish"),
      limit: z.number().int().positive().max(100).optional().default(20)
    },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "wordpress", "list_posts", input))
  );

  server.tool(
    "list_pages",
    "Lista paginas de WordPress para un sitio. Actualmente publica la accion y devuelve estado hasta configurar WordPress read-only.",
    {
      site_id: siteId(),
      status: z.enum(["publish", "draft", "private", "any"]).optional().default("publish"),
      limit: z.number().int().positive().max(100).optional().default(20)
    },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "wordpress", "list_pages", input))
  );

  server.tool(
    "get_categories",
    "Lista categorias WordPress de un sitio.",
    { site_id: siteId(), limit: z.number().int().positive().max(100).optional().default(50) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "wordpress", "get_categories", input))
  );

  server.tool(
    "get_tags",
    "Lista etiquetas WordPress de un sitio.",
    { site_id: siteId(), limit: z.number().int().positive().max(100).optional().default(50) },
    async (input) => jsonToolResponse(integrationNotConfigured(context, "wordpress", "get_tags", input))
  );

  server.tool(
    "create_post",
    "Crea una propuesta interna para crear una entrada WordPress. No publica ni modifica WordPress mientras READ_ONLY_MODE este activo.",
    {
      site_id: siteId(),
      title: z.string().min(1),
      content: z.string().min(1),
      excerpt: optionalText(),
      slug: optionalText(),
      status: z.enum(["draft", "pending", "publish"]).optional().default("draft")
    },
    async ({ site_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "wordpress_create_post",
          targetEntityType: "wordpress_post",
          riskLevel: "medium",
          afterPayload: payload,
          reason: "Requested through MCP create_post."
        })
      )
  );

  server.tool(
    "update_post",
    "Crea una propuesta interna para actualizar titulo, contenido, excerpt, slug o estado de una entrada WordPress.",
    {
      site_id: siteId(),
      post_id: z.string().min(1),
      title: optionalText(),
      content: optionalText(),
      excerpt: optionalText(),
      slug: optionalText(),
      status: z.enum(["draft", "pending", "publish", "private"]).optional()
    },
    async ({ site_id, post_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "wordpress_update_post",
          targetEntityType: "wordpress_post",
          targetEntityId: post_id,
          riskLevel: payload.slug || payload.status === "publish" ? "high" : "medium",
          afterPayload: payload,
          reason: "Requested through MCP update_post."
        })
      )
  );

  server.tool(
    "update_page",
    "Crea una propuesta interna para actualizar titulo, contenido, excerpt, slug o estado de una pagina WordPress.",
    {
      site_id: siteId(),
      page_id: z.string().min(1),
      title: optionalText(),
      content: optionalText(),
      excerpt: optionalText(),
      slug: optionalText(),
      status: z.enum(["draft", "pending", "publish", "private"]).optional()
    },
    async ({ site_id, page_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "wordpress_update_page",
          targetEntityType: "wordpress_page",
          targetEntityId: page_id,
          riskLevel: payload.slug || payload.status === "publish" ? "high" : "medium",
          afterPayload: payload,
          reason: "Requested through MCP update_page."
        })
      )
  );

  server.tool(
    "upload_media",
    "Crea una propuesta interna para subir un medio a WordPress. No sube archivos reales hasta configurar el cliente WordPress.",
    {
      site_id: siteId(),
      filename: z.string().min(1),
      alt_text: optionalText(),
      mime_type: optionalText()
    },
    async ({ site_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "wordpress_upload_media",
          targetEntityType: "wordpress_media",
          riskLevel: "medium",
          afterPayload: payload,
          reason: "Requested through MCP upload_media."
        })
      )
  );
}
