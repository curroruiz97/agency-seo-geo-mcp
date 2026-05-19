import type { Logger } from "pino";

/**
 * ContentGeneratorService: turns a ContentDraft outline + primary keyword
 * into fully written `contentHtml` ready to be sent to Elementor.
 *
 * Default provider: Anthropic Claude (Sonnet 4.6, the latest production model).
 * Set ANTHROPIC_API_KEY in env to enable.
 *
 * The service is invoked manually (via MCP tool `fill_content_draft`) or
 * automatically inside ExecuteService just before publishing a draft.
 *
 * Output contract:
 *   - HTML in elementor-friendly fragments (one paragraph per block).
 *   - Internal links suggested as `<a href="">` (post-processing replaces
 *     them with real URLs from the project's internal link map).
 *   - FAQ pairs returned separately for RankMath schema.
 */

export interface DraftOutline {
  sections: Array<{ heading: string; level: number; intent?: string }>;
}

export interface ContentGenerationInput {
  primaryKeyword: string;
  secondaryKeywords?: string[];
  intent?: string;
  outline: DraftOutline;
  language?: string;
  tone?: "informal" | "professional" | "expert" | "playful";
  targetWordCount?: number;
  brandName?: string;
  sector?: string;
}

export interface ContentGenerationResult {
  metaTitle: string;
  metaDescription: string;
  blocks: Array<
    | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
    | { type: "paragraph"; html: string }
    | { type: "list"; style: "unordered" | "ordered"; items: string[] }
  >;
  faqPairs: Array<{ question: string; answer: string }>;
  internalLinkAnchors: string[];
  rawProviderResponse?: string;
}

export class ContentGeneratorService {
  constructor(
    private readonly apiKey: string | null,
    private readonly model: string = "claude-sonnet-4-6",
    private readonly logger?: Logger
  ) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    if (!this.apiKey) {
      throw new Error("ContentGeneratorService: ANTHROPIC_API_KEY not configured.");
    }

    const systemPrompt = buildSystemPrompt(input);
    const userPrompt = buildUserPrompt(input);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 400)}`);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    return parseProviderResponse(text);
  }
}

function buildSystemPrompt(input: ContentGenerationInput): string {
  const tone = input.tone ?? "professional";
  const lang = input.language ?? "es";
  return [
    "Eres un copywriter SEO senior especializado en contenido para WordPress + Elementor + RankMath.",
    `Idioma de salida: ${lang}.`,
    `Tono: ${tone}.`,
    "Tu respuesta DEBE ser un único bloque JSON válido (sin markdown, sin texto antes o después).",
    "Esquema:",
    "{",
    '  "metaTitle": string,                // 55-60 chars, incluir keyword principal',
    '  "metaDescription": string,          // 150-160 chars, con CTA y keyword',
    '  "blocks": [                          // bloques que se renderizarán en Elementor',
    '    {"type":"heading","level":1|2|3|4,"text":"..."},',
    '    {"type":"paragraph","html":"..."}, // HTML válido: <strong>, <em>, <a href=\\"\\">',
    '    {"type":"list","style":"unordered"|"ordered","items":["...","..."]}',
    '  ],',
    '  "faqPairs": [{"question":"...","answer":"..."}],',
    '  "internalLinkAnchors": ["anchor 1", "anchor 2"]    // strings que el sistema reemplazará por enlaces reales',
    "}",
    "Reglas:",
    "- Empieza con un único H1.",
    "- Cada H2/H3 va seguido de al menos un párrafo.",
    "- Incluye keyword principal en H1, primer párrafo y al menos un H2.",
    "- Densidad natural; nunca keyword stuffing.",
    "- Las listas con `style: ordered` se renderizan como ol; `unordered` se renderiza como icon-list.",
    "- Las FAQ se renderizan como acordeón + schema FAQPage.",
    "- internalLinkAnchors son textos de anclaje sugeridos; déjalos como anchor sin url (la URL la pone el sistema).",
    "- No incluyas backlinks externos."
  ].join("\n");
}

function buildUserPrompt(input: ContentGenerationInput): string {
  const lines: string[] = [];
  lines.push(`Keyword principal: "${input.primaryKeyword}"`);
  if (input.secondaryKeywords && input.secondaryKeywords.length > 0) {
    lines.push(`Keywords secundarias: ${input.secondaryKeywords.join(", ")}`);
  }
  if (input.intent) lines.push(`Intent: ${input.intent}`);
  if (input.brandName) lines.push(`Marca: ${input.brandName}`);
  if (input.sector) lines.push(`Sector: ${input.sector}`);
  if (input.targetWordCount) lines.push(`Longitud objetivo: ~${input.targetWordCount} palabras`);
  lines.push("");
  lines.push("Outline propuesto (úsalo como guía; puedes reordenar o expandir si mejora la pieza):");
  for (const s of input.outline.sections) {
    lines.push(`  H${s.level}: ${s.heading}${s.intent ? ` (intent: ${s.intent})` : ""}`);
  }
  lines.push("");
  lines.push("Devuelve SOLO el JSON descrito en el sistema.");
  return lines.join("\n");
}

function parseProviderResponse(text: string): ContentGenerationResult {
  // The model is instructed to return only JSON. Defensive parsing: find the
  // first { and last } and try to JSON.parse the slice.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("ContentGenerator: model response did not contain a JSON object.");
  }
  const slice = text.slice(start, end + 1);
  const parsed = JSON.parse(slice);

  return {
    metaTitle: String(parsed.metaTitle ?? "").slice(0, 70),
    metaDescription: String(parsed.metaDescription ?? "").slice(0, 200),
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    faqPairs: Array.isArray(parsed.faqPairs) ? parsed.faqPairs : [],
    internalLinkAnchors: Array.isArray(parsed.internalLinkAnchors) ? parsed.internalLinkAnchors : [],
    rawProviderResponse: text
  };
}
