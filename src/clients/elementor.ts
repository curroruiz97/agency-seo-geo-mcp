import type { WordPressClient } from "./wordpress.js";

/**
 * Elementor adapter.
 *
 * Elementor stores the entire page layout as a JSON blob in the `_elementor_data`
 * post meta key (typically a stringified array of elementor "elements").
 * It also requires `_elementor_edit_mode = "builder"` and a specific template
 * type. We build a minimal but valid Elementor document from a "blocks" model
 * (heading, paragraph, list, image, faq, cta) so that the resulting post is
 * editable in Elementor without further fixes.
 *
 * For complex layouts we recommend the user provides a Saved Template ID in
 * Elementor (via Templates > Theme Builder) and we duplicate it.
 *
 * This adapter is intentionally simple: it covers ~80% of SEO content needs.
 * For full fidelity (kits, global colors, Pro widgets) the team should review
 * the generated _elementor_data structure before publishing.
 */

export type ElementorBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; html: string }
  | { type: "list"; style: "unordered" | "ordered"; items: string[] }
  | { type: "image"; mediaId: number; alt?: string; caption?: string }
  | { type: "faq"; items: Array<{ question: string; answer: string }> }
  | { type: "cta"; text: string; url: string; style?: "primary" | "secondary" };

export interface ElementorDocument {
  data: unknown;     // JSON-serialized array of elementor elements
  editMode: "builder";
  templateType: "wp-post" | "wp-page";
  version: string;
}

interface ElementorAdapterOptions {
  wp: WordPressClient;
}

let elementorIdCounter = 0;
function nextId(): string {
  elementorIdCounter = (elementorIdCounter + 1) % 0xffffffff;
  return Date.now().toString(36) + elementorIdCounter.toString(36);
}

function settings(s: Record<string, unknown>) {
  return s;
}

function widget(name: string, settingsObj: Record<string, unknown>, customCls?: string) {
  return {
    id: nextId(),
    elType: "widget",
    widgetType: name,
    settings: customCls ? { ...settingsObj, _css_classes: customCls } : settingsObj,
    elements: [],
    isInner: false
  };
}

function buildElement(block: ElementorBlock): unknown {
  switch (block.type) {
    case "heading":
      return widget("heading", settings({
        title: block.text,
        header_size: `h${block.level}`,
        align: "left"
      }));
    case "paragraph":
      return widget("text-editor", settings({ editor: `<p>${block.html}</p>` }));
    case "list": {
      const tag = block.style === "ordered" ? "ol" : "ul";
      const items = block.items.map((li) => `<li>${li}</li>`).join("");
      return widget("text-editor", settings({ editor: `<${tag}>${items}</${tag}>` }));
    }
    case "image":
      return widget("image", settings({
        image: { id: block.mediaId, url: "" },
        image_size: "large",
        caption: block.caption ?? "",
        alt: block.alt ?? ""
      }));
    case "faq": {
      // Simplest representation: accordion. Elementor Pro: widgetType "accordion".
      const items = block.items.map((it) => ({
        _id: nextId(),
        tab_title: it.question,
        tab_content: `<p>${it.answer}</p>`
      }));
      return widget("accordion", settings({ tabs: items }));
    }
    case "cta":
      return widget("button", settings({
        text: block.text,
        link: { url: block.url, is_external: "", nofollow: "" },
        button_type: block.style ?? "primary",
        align: "left"
      }));
  }
}

function wrapInSection(elements: unknown[]): unknown {
  return {
    id: nextId(),
    elType: "section",
    settings: {},
    elements: [{
      id: nextId(),
      elType: "column",
      settings: { _column_size: 100 },
      elements,
      isInner: false
    }],
    isInner: false
  };
}

export class ElementorAdapter {
  constructor(private readonly opts: ElementorAdapterOptions) {}

  buildDocument(blocks: ElementorBlock[]): ElementorDocument {
    const elements = blocks.map(buildElement);
    const sections = [wrapInSection(elements)];
    return {
      data: JSON.stringify(sections),
      editMode: "builder",
      templateType: "wp-post",
      version: "3.0.0"
    };
  }

  /**
   * Create a new WP post and inject the Elementor meta so it opens directly in
   * the Elementor editor. Returns the new post id.
   */
  async createPostWithElementor(input: {
    title: string;
    slug?: string;
    excerpt?: string;
    status?: "draft" | "publish" | "pending" | "future";
    type?: "post" | "page";
    blocks: ElementorBlock[];
    categories?: number[];
    tags?: number[];
    featuredMediaId?: number;
  }): Promise<{ id: number; editLink?: string; previewLink?: string }> {
    const doc = this.buildDocument(input.blocks);
    const created = await this.opts.wp.createPost({
      type: input.type ?? "post",
      title: input.title,
      content: "<!-- elementor placeholder -->",
      slug: input.slug,
      excerpt: input.excerpt,
      status: input.status ?? "draft",
      categories: input.categories,
      tags: input.tags,
      featured_media: input.featuredMediaId,
      meta: {
        _elementor_data: doc.data,
        _elementor_edit_mode: doc.editMode,
        _elementor_template_type: doc.templateType,
        _elementor_version: doc.version
      }
    });
    return {
      id: created.id,
      editLink: `${(input.type ?? "post") === "page" ? "page" : "post"}.php?post=${created.id}&action=elementor`,
      previewLink: created.link
    };
  }
}
