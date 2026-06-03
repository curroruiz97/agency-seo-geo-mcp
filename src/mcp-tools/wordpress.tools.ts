import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { createProposedChange, integrationNotConfigured, optionalText, siteId } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";
import { WordPressClient } from "../clients/wordpress.js";

/** Build a WordPress client for a project from its stored Application Password. */
async function buildWordPressClient(context: AppContext, projectId: string): Promise<WordPressClient | null> {
  if (!context.prisma || !context.services) return null;
  const project = await context.prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const creds = await context.services.credentials.getWordPress(projectId);
  if (!creds) return null;
  return new WordPressClient({
    baseUrl: project.wordpressUrl,
    username: creds.username,
    applicationPassword: creds.applicationPassword,
    logger: context.logger
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerWordPressTools(server: McpServer, context: AppContext) {
  server.tool("list_sites", "Lista los sitios/proyectos disponibles en el registro de la agencia.", {}, async () => {
    const sites = await context.repositories.projects.list({ status: "active", limit: 50 });
    return jsonToolResponse({ sites });
  });

  server.tool(
    "get_post",
    "Lee una entrada o pagina de WordPress (contenido, estado, slug, categorias, etiquetas, imagen destacada) por site_id e id. Util para verificar lo aplicado y para enlazado interno.",
    { site_id: siteId(), post_id: z.string().min(1), type: z.enum(["post", "page"]).optional().default("post") },
    async ({ site_id, post_id, type }) => {
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) {
        return jsonToolResponse(integrationNotConfigured(context, "wordpress", "get_post", { site_id, post_id }));
      }
      const id = Number(post_id);
      if (!Number.isFinite(id)) {
        return jsonToolResponse({ ok: false, error: "post_id must be a numeric WordPress id." });
      }
      try {
        const post = await wp.getPost(id, type);
        return jsonToolResponse({ ok: true, post });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: errorText(err) });
      }
    }
  );

  server.tool(
    "list_posts",
    "Lista entradas de WordPress (id, titulo, slug, estado, enlace) para enlazado interno y auditoria.",
    {
      site_id: siteId(),
      status: z.enum(["publish", "draft", "private", "any"]).optional().default("publish"),
      limit: z.number().int().positive().max(100).optional().default(20),
      search: optionalText()
    },
    async ({ site_id, status, limit, search }) => {
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) {
        return jsonToolResponse(integrationNotConfigured(context, "wordpress", "list_posts", { site_id }));
      }
      try {
        const posts = await wp.listPosts({ type: "post", status, per_page: limit, search: search || undefined });
        return jsonToolResponse({ ok: true, count: posts.length, posts });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: errorText(err) });
      }
    }
  );

  server.tool(
    "list_pages",
    "Lista paginas de WordPress (id, titulo, slug, estado, enlace) para enlazado interno y auditoria.",
    {
      site_id: siteId(),
      status: z.enum(["publish", "draft", "private", "any"]).optional().default("publish"),
      limit: z.number().int().positive().max(100).optional().default(20),
      search: optionalText()
    },
    async ({ site_id, status, limit, search }) => {
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) {
        return jsonToolResponse(integrationNotConfigured(context, "wordpress", "list_pages", { site_id }));
      }
      try {
        const pages = await wp.listPosts({ type: "page", status, per_page: limit, search: search || undefined });
        return jsonToolResponse({ ok: true, count: pages.length, pages });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: errorText(err) });
      }
    }
  );

  server.tool(
    "get_categories",
    "Lista categorias WordPress de un sitio (id, nombre, slug) para asignarlas al crear entradas.",
    { site_id: siteId(), limit: z.number().int().positive().max(100).optional().default(50) },
    async ({ site_id, limit }) => {
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) {
        return jsonToolResponse(integrationNotConfigured(context, "wordpress", "get_categories", { site_id }));
      }
      try {
        const categories = await wp.listCategories(limit);
        return jsonToolResponse({ ok: true, count: categories.length, categories });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: errorText(err) });
      }
    }
  );

  server.tool(
    "get_tags",
    "Lista etiquetas WordPress de un sitio (id, nombre, slug) para asignarlas al crear entradas.",
    { site_id: siteId(), limit: z.number().int().positive().max(100).optional().default(50) },
    async ({ site_id, limit }) => {
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) {
        return jsonToolResponse(integrationNotConfigured(context, "wordpress", "get_tags", { site_id }));
      }
      try {
        const tags = await wp.listTags(limit);
        return jsonToolResponse({ ok: true, count: tags.length, tags });
      } catch (err) {
        return jsonToolResponse({ ok: false, error: errorText(err) });
      }
    }
  );

  server.tool(
    "sideload_media",
    "Descarga imagenes desde URLs publicas y las sube a la Media Library del sitio (con alt text), devolviendo attachment_id y la URL LOCAL para insertarla en el contenido. Idempotente por nombre de archivo (no duplica). Requiere READ_ONLY_MODE=false. Es una accion directa (no pasa por aprobacion) porque solo agrega medios reutilizables.",
    {
      site_id: siteId(),
      images: z
        .array(
          z.object({
            source_url: z.string().url(),
            alt: z.string().min(1).describe("Texto alternativo (al menos uno deberia contener la focus keyword)."),
            filename: optionalText().describe("Nombre base opcional; si se omite se deriva del alt."),
            title: optionalText()
          })
        )
        .min(1)
        .max(20)
    },
    async ({ site_id, images }) => {
      if (context.config.READ_ONLY_MODE) {
        return jsonToolResponse({
          ok: false,
          error:
            "READ_ONLY_MODE is enabled; media upload is blocked. Set READ_ONLY_MODE=false to allow sideloading images."
        });
      }
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) {
        return jsonToolResponse(integrationNotConfigured(context, "wordpress", "sideload_media", { site_id }));
      }
      const media: Array<Record<string, unknown>> = [];
      for (const img of images) {
        try {
          const result = await wp.uploadMediaFromUrl({
            fileUrl: img.source_url,
            filename: img.filename || img.alt,
            altText: img.alt
          });
          media.push({
            ok: true,
            source_url: img.source_url,
            attachment_id: result.id,
            url: result.sourceUrl,
            alt: img.alt,
            reused: result.reused
          });
        } catch (err) {
          media.push({ ok: false, source_url: img.source_url, error: errorText(err) });
        }
      }
      const uploaded = media.filter((m) => m["ok"] === true).length;
      return jsonToolResponse({
        ok: uploaded > 0,
        uploaded,
        total: images.length,
        media,
        note: "Inserta SIEMPRE la 'url' local devuelta en el contenido; nunca la source_url externa."
      });
    }
  );

  server.tool(
    "create_post",
    "Crea una propuesta interna para crear una entrada WordPress (borrador por defecto). Acepta categorias, etiquetas e imagen destacada (usa get_categories/get_tags/sideload_media para obtener los ids). No publica ni modifica WordPress hasta aprobar y ejecutar.",
    {
      site_id: siteId(),
      title: z.string().min(1),
      content: z.string().min(1),
      excerpt: optionalText(),
      slug: optionalText(),
      status: z.enum(["draft", "pending", "publish"]).optional().default("draft"),
      categories: z.array(z.number().int().positive()).optional().describe("IDs de categorias (de get_categories)."),
      tags: z.array(z.number().int().positive()).optional().describe("IDs de etiquetas (de get_tags)."),
      featured_media: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("attachment_id de la imagen destacada (de sideload_media).")
    },
    async ({ site_id, ...payload }) =>
      jsonToolResponse(
        await createProposedChange(context, {
          siteId: site_id,
          changeType: "wordpress_create_post",
          targetEntityType: "wordpress_post",
          riskLevel: payload.status === "publish" ? "high" : "medium",
          afterPayload: payload,
          reason: "Requested through MCP create_post."
        })
      )
  );

  server.tool(
    "update_post",
    "Crea una propuesta interna para actualizar titulo, contenido, excerpt, slug, estado, categorias, etiquetas o imagen destacada de una entrada WordPress.",
    {
      site_id: siteId(),
      post_id: z.string().min(1),
      title: optionalText(),
      content: optionalText(),
      excerpt: optionalText(),
      slug: optionalText(),
      status: z.enum(["draft", "pending", "publish", "private"]).optional(),
      categories: z.array(z.number().int().positive()).optional(),
      tags: z.array(z.number().int().positive()).optional(),
      featured_media: z.number().int().positive().optional()
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
    "Crea una propuesta interna para subir un medio a WordPress. Para subir imagenes de inmediato y obtener la URL local, usa sideload_media en su lugar.",
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
