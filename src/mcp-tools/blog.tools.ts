import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../app/appContext.js";
import { integrationNotConfigured, optionalText, siteId } from "./actionHelpers.js";
import { jsonToolResponse } from "./response.js";
import { buildWordPressClient } from "./wordpress.tools.js";

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
  "Longitud MINIMA 2.500 palabras de TEXTO VISIBLE (sin contar etiquetas HTML). Mídelo con validate_article, no a ojo; si <2500 añade secciones de valor y RECUENTA. No cierres por debajo.",
  ">=4 imágenes con alt descriptivo; al menos una con la keyword; SIEMPRE imágenes locales (usa sideload_media).",
  "Keywords secundarias presentes de forma natural en el cuerpo.",
  "Enlaces externos DoFollow a fuentes de autoridad del sector (p. ej. BOE / ministerio).",
  "Enlaces internos a páginas/posts relevantes del sitio (usa list_posts / list_pages).",
  "Schema Article (update_rankmath_metadata schema_type=Article).",
  "Densidad de keyword segun RankMath = (apariciones EXACTAS de la focus keyword en el texto) / (total de palabras) x 100. Objetivo 1-1.5% (MINIMO 1%, nunca >2.5%). NO uses la 'densidad de frase exacta' de otras formulas (da numeros inflados). Mídelo con validate_article.",
  "Índice (TOC) + jerarquía correcta H2 > H3.",
  "Idioma e intención del sitio; criterios GEO (entidad, ubicación, claridad para motores generativos)."
];

const PIPELINE_STEPS: string[] = [
  "1. get_blog_playbook(site_id) — lee config + checklist + hardRules. Si configured:false, para y pide set_blog_config.",
  "2. Keywords (SE Ranking, sin proyecto): DATA_getKeywordsMetrics (source 'es') sobre 5-8 candidatas de las seedKeywords; elige UNA por volumen + KD baja/moderada + intencion.",
  "3. Anti-canibalizacion: list_used_keywords(site_id) + list_pages(status=any) + list_posts(status=any). Evita terminos core ya cubiertos por /servicios/... y posts; angulo diferenciado. Di la keyword y por que.",
  "4. Redacta el HTML FINAL y COMPLETO de una vez: >=2500 palabras de texto visible, TOC con anclas, H2>H3, keyword en title/primer parrafo/>=1 H2/slug/>=1 alt, secundarias naturales, enlaces internos REALES (de list_pages/list_posts) + externos DoFollow. Verifica con web_search CADA url externa y CADA referencia legal/cifra antes de incluirla; nunca de memoria (el enlace BOE debe resolver).",
  "5. validate_article(html, focus, secundarias, seo_title, meta, slug) ANTES de crear nada. Si ok:false (palabras<2500, densidad<1%, falta keyword en title/H2/slug, <min_images con alt, title>60, meta>155...), CORRIGE y revalida. NO crees el post hasta ok:true.",
  "6. Imagenes (>=min_images): de web_search saca IDs de las URLs de resultados de Pexels (pexels.com/photo/...-{ID}/) y construye https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=1600 (fallback Unsplash directo). sideload_media; usa SIEMPRE la 'url' local devuelta; alt con keyword en el hero.",
  "7. create_post UNA sola vez con el HTML ya validado: draft, categoria=default_category_id, featured_media=hero, slug con keyword, excerpt con keyword. propose -> approve(APPROVER) -> execute. NUNCA entregues HTML para descargar ni te pares fuera del flujo: el borrador lo dejas TU.",
  "8. update_rankmath_metadata: focus + secundarias, seo_title (<=60, power word + año), meta (<=155 con keyword), schema_type=Article. approve -> execute.",
  "9. reset_post_elementor SOLO si el post esta en modo builder (elementorEditMode=='builder'). Los posts creados por el MCP NO lo estan (elementorInSync:true ya) -> es opcional/no-op, pero ejecutalo igual como ULTIMO write por seguridad. Si editas contenido despues, repitelo. No abras el post en el editor de Elementor (re-vincula).",
  "10. register_used_keyword(site_id, keyword, secondary, post_id, slug, title).",
  "11. Verifica el bloque verified del ultimo execute (renderedOk:true, imagesRendered200>=min_images, imagesBroken:0, featuredMediaId, elementorInSync:true) y entrega: link de edicion, keyword + secundarias, nº palabras y densidad (de validate_article), nota RankMath, bloque verified."
];

/** Hard, non-negotiable rules distilled from real failures. Returned by the playbook. */
const HARD_RULES: string[] = [
  "Ejecuta el pipeline COMPLETO hasta el borrador. NUNCA entregues un HTML para descargar ni te pares a 'pedir permiso' fuera del flujo: propose -> approve -> execute lo ejecutas TU y todo queda en draft (es seguro).",
  "Minimo 2.500 palabras de TEXTO VISIBLE (sin etiquetas). Mídelo con validate_article, NO a ojo.",
  "Densidad RankMath = apariciones de la focus keyword / total de palabras x 100. Objetivo 1-1.5% (min 1%). NO uses la 'densidad de frase exacta' (infla el numero).",
  "Escribe el contenido FINAL completo y pasalo por validate_article ANTES de create_post. Evita re-enviar el contenido en update_post despues (payloads caros y re-vincula Elementor).",
  "Verifica con web_search TODA url externa y TODA referencia legal/cifra antes de incluirla. Nunca de memoria.",
  "Imagenes SIEMPRE locales via sideload_media; jamas enlaces una imagen externa en el contenido.",
  "reset_post_elementor es el ULTIMO write. No abras el post en el editor de Elementor."
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

type BlogConfigView = ReturnType<typeof buildConfigView>;

/** Map the WP plugin's saved option (snake_case) to the config view shape. */
function normalizeBridgeConfig(b: Record<string, unknown>): BlogConfigView {
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const seeds = Array.isArray(b["seed_keywords"])
    ? (b["seed_keywords"] as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    : typeof b["seed_keywords"] === "string"
      ? String(b["seed_keywords"]).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      : [];
  const catId = num(b["default_category_id"]);
  const authId = num(b["default_author_id"]);
  const tplId = num(b["template_id"]);
  return {
    sector: str(b["sector"]),
    seedKeywords: seeds,
    language: typeof b["language"] === "string" && b["language"] ? String(b["language"]) : "es-ES",
    city: str(b["city"]),
    defaultCategoryId: catId && catId > 0 ? catId : null,
    defaultAuthorId: authId && authId > 0 ? authId : null,
    renderMode: typeof b["render_mode"] === "string" && b["render_mode"] ? String(b["render_mode"]) : "theme-builder-single",
    template: { id: tplId && tplId > 0 ? tplId : null, type: str(b["template_type"]), name: str(b["template_name"]) },
    minImages: num(b["min_images"]) ?? 4,
    imageSource: str(b["image_source"]),
    notes: str(b["notes"])
  };
}

/**
 * Resolve a site's blog config, PLUGIN FIRST (per-site source of truth set in
 * wp-admin), then the MCP database as fallback (configured via set_blog_config).
 */
async function resolveBlogConfig(
  context: AppContext,
  projectId: string
): Promise<{ configured: boolean; source: "wp_plugin" | "mcp_db" | null; config: BlogConfigView | null }> {
  const wp = await buildWordPressClient(context, projectId);
  if (wp) {
    const bridge = await wp.getBridgeBlogConfig();
    if (bridge && bridge["configured"] === true) {
      return { configured: true, source: "wp_plugin", config: normalizeBridgeConfig(bridge) };
    }
  }
  if (context.prisma) {
    const project = await context.prisma.project.findUnique({ where: { id: projectId }, include: { blogConfig: true } });
    if (project?.blogConfig) {
      return { configured: true, source: "mcp_db", config: buildConfigView(project, project.blogConfig) };
    }
  }
  return { configured: false, source: null, config: null };
}

// ---------------------------------------------------------------------------
// Deterministic article validator — turns the RankMath checklist into a hard
// gate so quality can't be "self-assessed wrong" (e.g. density measured wrong).
// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function countOccurrences(haystackLower: string, needle: string): number {
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  let count = 0;
  let idx = haystackLower.indexOf(n);
  while (idx !== -1) {
    count += 1;
    idx = haystackLower.indexOf(n, idx + n.length);
  }
  return count;
}

function toSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateArticle(input: {
  html: string;
  focus_keyword: string;
  secondary_keywords?: string[];
  seo_title?: string;
  meta_description?: string;
  slug?: string;
  site_url?: string;
  min_words?: number;
  min_images?: number;
}): Record<string, unknown> {
  const minWords = input.min_words ?? 2500;
  const minImages = input.min_images ?? 4;
  const html = input.html;
  const focusLower = input.focus_keyword.trim().toLowerCase();

  const visible = stripTags(html);
  const visibleLower = visible.toLowerCase();
  const wordCount = countWords(visible);

  // RankMath-style density: focus-keyword appearances / total words * 100.
  const kwOccurrences = countOccurrences(visibleLower, focusLower);
  const densityPercent = wordCount > 0 ? (kwOccurrences / wordCount) * 100 : 0;

  const firstP = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const firstParaText = (stripTags(firstP) || visible.split(" ").slice(0, 120).join(" ")).toLowerCase();
  const keywordInFirstParagraph = firstParaText.includes(focusLower);

  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripTags(m[1]).toLowerCase());
  const h3Count = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].length;
  const keywordInAnyH2 = h2s.some((h) => h.includes(focusLower));

  let siteHost = "";
  if (input.site_url) {
    try {
      siteHost = new URL(input.site_url).host;
    } catch {
      siteHost = "";
    }
  }

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  let imagesWithAlt = 0;
  let altWithKeyword = 0;
  let externalImages = 0;
  for (const tag of imgTags) {
    const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    if (alt.trim()) imagesWithAlt += 1;
    if (alt.toLowerCase().includes(focusLower)) altWithKeyword += 1;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "";
    if (/^https?:\/\//i.test(src)) {
      let host = "";
      try {
        host = new URL(src).host;
      } catch {
        host = "";
      }
      if (siteHost ? host !== siteHost : !src.includes("/wp-content/uploads/")) externalImages += 1;
    }
  }

  let internalLinks = 0;
  let externalDoFollow = 0;
  let externalNoFollow = 0;
  let tocAnchors = 0;
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    const href = m[1];
    if (href.startsWith("#")) {
      tocAnchors += 1;
      continue;
    }
    const isHttp = /^https?:\/\//i.test(href);
    let host = "";
    if (isHttp) {
      try {
        host = new URL(href).host;
      } catch {
        host = "";
      }
    }
    const isExternal = isHttp && (!siteHost || host !== siteHost);
    if (isExternal) {
      if (/rel=["'][^"']*nofollow/i.test(tag)) externalNoFollow += 1;
      else externalDoFollow += 1;
    } else {
      internalLinks += 1;
    }
  }

  const title = (input.seo_title ?? "").trim();
  const meta = (input.meta_description ?? "").trim();
  const slug = (input.slug ?? "").trim();
  const keywordInSlug = slug ? slug.toLowerCase().includes(toSlug(input.focus_keyword)) : false;

  const issues: string[] = [];
  if (wordCount < minWords) issues.push(`Solo ${wordCount} palabras de texto visible (minimo ${minWords}).`);
  if (densityPercent < 1.0) issues.push(`Densidad RankMath ${densityPercent.toFixed(2)}% (<1%). Añade apariciones naturales de la keyword.`);
  if (densityPercent > 2.5) issues.push(`Densidad RankMath ${densityPercent.toFixed(2)}% (>2.5%, sobreoptimizado).`);
  if (title && !title.toLowerCase().includes(focusLower)) issues.push("La focus keyword no esta en el SEO title.");
  if (title && title.length > 60) issues.push(`SEO title ${title.length} caracteres (>60).`);
  if (!keywordInFirstParagraph) issues.push("La focus keyword no esta en el primer parrafo.");
  if (!keywordInAnyH2) issues.push("La focus keyword no esta en ningun H2.");
  if (slug && !keywordInSlug) issues.push("La focus keyword no esta en el slug.");
  if (meta && !meta.toLowerCase().includes(focusLower)) issues.push("La meta description no contiene la keyword.");
  if (meta && meta.length > 155) issues.push(`Meta description ${meta.length} caracteres (>155).`);
  if (imgTags.length < minImages) issues.push(`Solo ${imgTags.length} imagenes (minimo ${minImages}).`);
  if (imagesWithAlt < imgTags.length) issues.push(`${imgTags.length - imagesWithAlt} imagen(es) sin alt.`);
  if (altWithKeyword < 1) issues.push("Ninguna imagen tiene la keyword en el alt.");
  if (externalImages > 0) issues.push(`${externalImages} imagen(es) externas en el contenido (usa sideload_media -> url local).`);
  if (externalDoFollow < 1) issues.push("Falta >=1 enlace externo DoFollow a fuente de autoridad.");
  if (internalLinks < 1) issues.push("Falta >=1 enlace interno.");
  if (tocAnchors < 2) issues.push("No se detecta indice (TOC) con anclas (#).");

  return {
    ok: issues.length === 0,
    wordCount,
    minWords,
    keywordOccurrences: kwOccurrences,
    keywordDensityPercent: Number(densityPercent.toFixed(2)),
    densityTarget: "1.0-1.5% (RankMath = apariciones de la keyword / total palabras)",
    keywordInTitle: title ? title.toLowerCase().includes(focusLower) : null,
    seoTitleLength: title.length,
    keywordInFirstParagraph,
    keywordInAnyH2,
    h2Count: h2s.length,
    h3Count,
    keywordInSlug,
    metaDescriptionLength: meta.length,
    keywordInMeta: meta ? meta.toLowerCase().includes(focusLower) : null,
    imageCount: imgTags.length,
    imagesWithAlt,
    altWithKeyword,
    externalImagesInContent: externalImages,
    internalLinks,
    externalDoFollowLinks: externalDoFollow,
    externalNoFollowLinks: externalNoFollow,
    hasTOC: tocAnchors >= 2,
    secondaryKeywords: (input.secondary_keywords ?? []).map((s) => ({ keyword: s, present: visibleLower.includes(s.toLowerCase()) })),
    issues
  };
}

export function registerBlogTools(server: McpServer, context: AppContext) {
  server.tool(
    "get_blog_config",
    "Lee la configuracion de Blog Automation de un sitio (plantilla, sector, idioma, ciudad, categoria por defecto, modo de render, politica de imagenes). Prioriza la config del plugin en wp-admin (por-web) y usa la BD del MCP como fallback. Devuelve configured:false si no hay ninguna.",
    { site_id: siteId() },
    async ({ site_id }) => {
      const resolved = await resolveBlogConfig(context, site_id);
      if (!resolved.configured) {
        return jsonToolResponse({
          configured: false,
          site_id,
          message: "No hay configuracion de blog. Configurala en wp-admin (Ajustes -> Avenue Blog) o con set_blog_config."
        });
      }
      return jsonToolResponse({ configured: true, site_id, source: resolved.source, config: resolved.config });
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
    "list_blog_templates",
    "Lista las plantillas de Elementor del sitio (id, nombre, tipo) para elegir cual usa el blog. Requiere el mu-plugin Avenue MCP Blog Automation instalado en la web.",
    { site_id: siteId() },
    async ({ site_id }) => {
      const wp = await buildWordPressClient(context, site_id);
      if (!wp) return jsonToolResponse(integrationNotConfigured(context, "wordpress", "list_blog_templates", { site_id }));
      try {
        const templates = await wp.listElementorTemplates();
        return jsonToolResponse({ ok: true, site_id, count: templates.length, templates });
      } catch (err) {
        return jsonToolResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          hint: "Instala el mu-plugin avenue-mcp-blog-automation.php en wp-content/mu-plugins/ de la web."
        });
      }
    }
  );

  server.tool(
    "validate_article",
    "Valida un articulo HTML contra el checklist RankMath ANTES de crear el post: palabras de texto visible, densidad de keyword (metodo RankMath = apariciones/total), keyword en title/primer parrafo/H2/slug/alt, imagenes con alt, enlaces internos/externos DoFollow, longitudes de title/meta y TOC. Devuelve ok + issues[]. Llamalo y CORRIGE hasta ok:true antes de create_post.",
    {
      html: z.string().min(1),
      focus_keyword: z.string().min(1),
      secondary_keywords: z.array(z.string().min(1)).optional(),
      seo_title: optionalText(),
      meta_description: optionalText(),
      slug: optionalText(),
      site_url: optionalText(),
      min_words: z.number().int().positive().max(20000).optional(),
      min_images: z.number().int().positive().max(20).optional()
    },
    async (input) => jsonToolResponse(validateArticle(input))
  );

  server.tool(
    "get_blog_playbook",
    "Devuelve la config del sitio + el checklist RankMath de 14 puntos (el que dio 95/100) + los pasos del pipeline para crear un articulo de calidad. LEE ESTO ANTES de redactar 'haz un articulo para {sitio}'.",
    { site_id: siteId() },
    async ({ site_id }) => {
      const resolved = await resolveBlogConfig(context, site_id);
      return jsonToolResponse({
        site_id,
        configured: resolved.configured,
        configSource: resolved.source,
        config: resolved.config,
        configHint: resolved.configured ? undefined : "Sin config de blog: configurala en wp-admin (Ajustes -> Avenue Blog) o con set_blog_config antes de generar.",
        keywordResearch:
          "Usa el conector de SE Ranking (MCP aparte) para volumen + dificultad + keywords relacionadas del sector. No necesita proyecto creado.",
        antiCannibalization:
          "Antes de fijar la keyword: list_used_keywords + list_pages + list_posts. Si el termino core ya esta cubierto por una pagina de servicio, usa un angulo diferenciado (lección 3551).",
        minWords: 2500,
        hardRules: HARD_RULES,
        validation:
          "OBLIGATORIO: pasa el HTML por validate_article ANTES de create_post y corrige hasta ok:true (palabras, densidad RankMath real, keyword en title/H2/slug, imagenes con alt, enlaces). No te fies de medir 'a ojo'.",
        checklist: RANKMATH_CHECKLIST,
        pipeline: PIPELINE_STEPS,
        rules: "Siempre draft/private. Nunca publicar sin OK humano. propose -> approve -> execute. No credenciales en URLs/contenido."
      });
    }
  );
}
