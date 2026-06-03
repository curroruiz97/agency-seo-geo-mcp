import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { optionalText, siteId } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";

/**
 * The 14-point RankMath checklist that scored 95/100 on post 3551. Embedded so
 * "haz un artículo para {sitio}" produces consistent ≥90 articles. Returned by
 * get_blog_playbook as hard rules for the writer.
 */
const RANKMATH_CHECKLIST: string[] = [
  "Keyword objetivo NO canibalizada: si una página/post fuerte ya cubre el término core, usa un ángulo diferenciado (p. ej. 'integral', 'guía', 'normativa', 'cómo elegir', '{ciudad}', long-tail). Lección 3551: se usó 'gestión integral de residuos peligrosos' para no competir con /servicios/residuos-peligrosos/.",
  "Keyword en el SEO title, en el primer párrafo y en al menos un H2.",
  "Power word en el title (p. ej. 'esencial', 'guía', 'definitiva') + año cuando aporte.",
  "Keyword en el slug completo (incluye conectores: gestion-integral-de-residuos-peligrosos).",
  "Meta description con la keyword, <=155 caracteres, atractiva.",
  "Longitud ~2.000-2.500+ palabras de contenido útil, sin relleno.",
  ">=4 imágenes con alt descriptivo; al menos una con la keyword; SIEMPRE imágenes locales (usa sideload_media).",
  "Keywords secundarias presentes de forma natural en el cuerpo.",
  "Enlaces externos DoFollow a fuentes de autoridad del sector (p. ej. BOE / ministerio).",
  "Enlaces internos a páginas/posts relevantes del sitio (usa list_posts / list_pages).",
  "Schema Article (update_rankmath_metadata schema_type=Article).",
  "Densidad de keyword 1-1.5% (sin sobreoptimizar; no pasar de ~2.5%).",
  "Índice (TOC) + jerarquía correcta H2 > H3.",
  "Idioma e intención del sitio; criterios GEO (entidad, ubicación, claridad para motores generativos)."
];

const PIPELINE_STEPS: string[] = [
  "1. get_blog_playbook(site_id) — lee config + checklist (este resultado). Si configured:false, para y pide configurar con set_blog_config.",
  "2. Investiga la keyword con el conector de SE Ranking (volumen + dificultad + relacionadas del sector/seed). NO necesita proyecto creado.",
  "3. Anti-canibalización: list_used_keywords(site_id) + list_pages + list_posts. Evita términos core ya cubiertos; elige ángulo diferenciado.",
  "4. Redacta el HTML cumpliendo los 14 puntos del checklist (~2.500 palabras, TOC, enlaces internos+externos, secundarias).",
  "5. sideload_media: sube >=min_images imágenes (alt con keyword en una; nombres en slug). Usa SIEMPRE las URLs locales devueltas.",
  "6. create_post: post_content limpio con imágenes locales, status=draft (o private), category = default_category_id, featured_media = hero. → approve → execute.",
  "7. update_rankmath_metadata: focus keyword + secundarias, SEO title (<=60 con power word + año), meta description (<=155 con keyword), schema_type=Article. → approve → execute.",
  "8. reset_post_elementor (si render_mode = theme-builder-single): desvincula el builder para que pinte la plantilla Single del cliente. → approve → execute.",
  "9. register_used_keyword(site_id, keyword, secondary, post_id) — registra la keyword para no repetirla.",
  "10. Verifica: el bloque verified de execute (renderedOk, imagesRendered200, imagesBroken:0, featuredMediaId) y la nota RankMath. Entrega: link, keyword focus + secundarias, nota, estado de render e imágenes."
];

function buildConfigView(project: { sector: string | null; language: string; targetCity: string | null }, c: {
  sector: string | null; seedKeywords: string[]; language: string; city: string | null;
  defaultCategoryId: number | null; defaultAuthorId: number | null; renderMode: string;
  templateId: number | null; templateType: string | null; templateName: string | null;
  minImages: number; imageSource: string | null; notes: string | null;
}) {
  return {
    sector: c.sector ?? project.sector ?? null,
    seedKeywords: c.seedKeywords,
    language: c.language ?? project.language,
    city: c.city ?? project.targetCity ?? null,
    defaultCategoryId: c.defaultCategoryId,
    defaultAuthorId: c.defaultAuthorId,
    renderMode: c.renderMode,
    template: { id: c.templateId, type: c.templateType, name: c.templateName },
    minImages: c.minImages,
    imageSource: c.imageSource,
    notes: c.notes
  };
}

export function registerBlogTools(server: McpServer, context: AppContext) {
  server.tool(
    "get_blog_config",
    "Lee la configuracion de Blog Automation de un sitio (sector, idioma, ciudad, categoria por defecto, modo de render, plantilla, politica de imagenes). Si no esta configurada devuelve configured:false.",
    { site_id: siteId() },
    async ({ site_id }) => {
      if (!context.prisma) return jsonToolResponse({ configured: false, error: "database_not_configured" });
      const project = await context.prisma.project.findUnique({ where: { id: site_id }, include: { blogConfig: true } });
      if (!project) return jsonToolResponse({ configured: false, error: "project_not_found", site_id });
      if (!project.blogConfig) {
        return jsonToolResponse({
          configured: false,
          site_id,
          message: "No hay configuracion de blog. Usa set_blog_config para definir sector, idioma, categoria por defecto y modo de render."
        });
      }
      return jsonToolResponse({ configured: true, site_id, config: buildConfigView(project, project.blogConfig) });
    }
  );

  server.tool(
    "set_blog_config",
    "Crea o actualiza la configuracion de Blog Automation de un sitio. Solo se modifican los campos que envies. render_mode 'theme-builder-single' (recomendado, validado) deja que la plantilla Single del cliente pinte el post tras reset_post_elementor.",
    {
      site_id: siteId(),
      sector: optionalText(),
      seed_keywords: z.array(z.string().min(1)).optional(),
      language: optionalText(),
      city: optionalText(),
      default_category_id: z.number().int().positive().optional(),
      default_author_id: z.number().int().positive().optional(),
      render_mode: z.enum(["theme-builder-single", "cloned-layout"]).optional(),
      template_id: z.number().int().positive().optional(),
      template_type: optionalText(),
      template_name: optionalText(),
      min_images: z.number().int().min(1).max(20).optional(),
      image_source: optionalText(),
      notes: optionalText()
    },
    async ({ site_id, ...p }) => {
      if (!context.prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const project = await context.prisma.project.findUnique({ where: { id: site_id } });
      if (!project) return jsonToolResponse({ ok: false, error: "project_not_found", site_id });

      const update: Record<string, unknown> = { configured: true };
      if (p.sector !== undefined) update["sector"] = p.sector;
      if (p.seed_keywords !== undefined) update["seedKeywords"] = p.seed_keywords;
      if (p.language !== undefined) update["language"] = p.language;
      if (p.city !== undefined) update["city"] = p.city;
      if (p.default_category_id !== undefined) update["defaultCategoryId"] = p.default_category_id;
      if (p.default_author_id !== undefined) update["defaultAuthorId"] = p.default_author_id;
      if (p.render_mode !== undefined) update["renderMode"] = p.render_mode;
      if (p.template_id !== undefined) update["templateId"] = p.template_id;
      if (p.template_type !== undefined) update["templateType"] = p.template_type;
      if (p.template_name !== undefined) update["templateName"] = p.template_name;
      if (p.min_images !== undefined) update["minImages"] = p.min_images;
      if (p.image_source !== undefined) update["imageSource"] = p.image_source;
      if (p.notes !== undefined) update["notes"] = p.notes;

      const saved = await context.prisma.blogConfig.upsert({
        where: { projectId: site_id },
        create: { projectId: site_id, seedKeywords: p.seed_keywords ?? [], ...update },
        update
      });
      return jsonToolResponse({ ok: true, site_id, config: buildConfigView(project, saved) });
    }
  );

  server.tool(
    "register_used_keyword",
    "Registra una keyword ya usada en un articulo del sitio (anti-canibalizacion). Llamar al final del pipeline tras crear el post.",
    {
      site_id: siteId(),
      keyword: z.string().min(1),
      secondary: z.array(z.string().min(1)).optional(),
      post_id: optionalText(),
      title: optionalText(),
      slug: optionalText(),
      status: optionalText()
    },
    async ({ site_id, keyword, secondary, post_id, title, slug, status }) => {
      if (!context.prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const saved = await context.prisma.blogKeywordUsed.upsert({
        where: { projectId_keyword: { projectId: site_id, keyword } },
        create: {
          projectId: site_id,
          keyword,
          secondary: secondary ?? [],
          postId: post_id || null,
          title: title || null,
          slug: slug || null,
          status: status || "draft"
        },
        update: {
          secondary: secondary ?? undefined,
          postId: post_id || undefined,
          title: title || undefined,
          slug: slug || undefined,
          status: status || undefined
        }
      });
      return jsonToolResponse({ ok: true, registered: { keyword: saved.keyword, postId: saved.postId, status: saved.status } });
    }
  );

  server.tool(
    "list_used_keywords",
    "Lista las keywords ya usadas en articulos del sitio (registro interno) para evitar repetir o canibalizar. Combinalo con list_pages/list_posts (URLs de servicio) y SE Ranking.",
    { site_id: siteId() },
    async ({ site_id }) => {
      if (!context.prisma) return jsonToolResponse({ ok: false, error: "database_not_configured" });
      const rows = await context.prisma.blogKeywordUsed.findMany({
        where: { projectId: site_id },
        orderBy: { createdAt: "desc" },
        take: 200
      });
      return jsonToolResponse({
        ok: true,
        site_id,
        count: rows.length,
        keywords: rows.map((r) => ({ keyword: r.keyword, secondary: r.secondary, postId: r.postId, title: r.title, slug: r.slug, status: r.status })),
        note: "Para anti-canibalizacion completa, combina esto con list_pages/list_posts (URLs de servicio existentes) y los datos de SE Ranking."
      });
    }
  );

  server.tool(
    "get_blog_playbook",
    "Devuelve la config del sitio + el checklist RankMath de 14 puntos (el que dio 95/100) + los pasos del pipeline para crear un articulo de calidad. LEE ESTO ANTES de redactar 'haz un articulo para {sitio}'.",
    { site_id: siteId() },
    async ({ site_id }) => {
      let config: ReturnType<typeof buildConfigView> | null = null;
      let configured = false;
      if (context.prisma) {
        const project = await context.prisma.project.findUnique({ where: { id: site_id }, include: { blogConfig: true } });
        if (project?.blogConfig) {
          configured = true;
          config = buildConfigView(project, project.blogConfig);
        }
      }
      return jsonToolResponse({
        site_id,
        configured,
        config,
        configHint: configured ? undefined : "Sin config de blog: usa set_blog_config antes de generar (sector, idioma, categoria, render_mode).",
        keywordResearch:
          "Usa el conector de SE Ranking (MCP aparte) para volumen + dificultad + keywords relacionadas del sector. No necesita proyecto creado.",
        antiCannibalization:
          "Antes de fijar la keyword: list_used_keywords + list_pages + list_posts. Si el termino core ya esta cubierto por una pagina de servicio, usa un angulo diferenciado (lección 3551).",
        checklist: RANKMATH_CHECKLIST,
        pipeline: PIPELINE_STEPS,
        rules: "Siempre draft/private. Nunca publicar sin OK humano. propose -> approve -> execute. No credenciales en URLs/contenido."
      });
    }
  );
}
