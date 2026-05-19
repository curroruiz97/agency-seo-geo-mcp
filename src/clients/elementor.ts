import { randomBytes } from "node:crypto";
import type { WordPressClient } from "./wordpress.js";

export type ElementorBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string; align?: "left" | "center" | "right" }
  | { type: "paragraph"; html: string }
  | { type: "list"; style: "unordered" | "ordered"; items: string[] }
  | { type: "image"; attachmentId: number; url?: string; caption?: string }
  | { type: "faq"; items: Array<{ question: string; answer: string }> }
  | { type: "cta"; text: string; url: string; openInNewTab?: boolean; nofollow?: boolean }
  | { type: "divider" }
  | { type: "spacer"; pixels?: number };

export interface ElementorAdapterOptions {
  wp: WordPressClient;
  engineVersion?: string;
}

function hexId(): string { return randomBytes(4).toString("hex"); }

function heading(text: string, level: number, align?: string): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "heading",
    settings: { title: text, header_size: `h${Math.min(6, Math.max(1, level))}`, align: align ?? "left" },
    elements: []
  };
}
function textEditor(html: string): unknown {
  return { id: hexId(), elType: "widget", widgetType: "text-editor", settings: { editor: html }, elements: [] };
}
function iconList(items: string[]): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "icon-list",
    settings: {
      icon_list: items.map((text) => ({
        _id: hexId(), text, selected_icon: { value: "fas fa-check", library: "fa-solid" }
      }))
    },
    elements: []
  };
}
function orderedList(items: string[]): unknown {
  const html = `<ol>${items.map((it) => `<li>${it}</li>`).join("")}</ol>`;
  return textEditor(html);
}
function imageWidget(attachmentId: number, url?: string, caption?: string): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "image",
    settings: {
      image: { id: attachmentId, url: url ?? "" },
      image_size: "large",
      caption_source: caption ? "custom" : "none",
      ...(caption ? { caption } : {})
    },
    elements: []
  };
}
function accordion(items: Array<{ question: string; answer: string }>): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "accordion",
    settings: {
      tabs: items.map((it) => ({ _id: hexId(), tab_title: it.question, tab_content: `<p>${it.answer}</p>` })),
      title_html_tag: "h3"
    },
    elements: []
  };
}
function button(text: string, url: string, openInNewTab?: boolean, nofollow?: boolean): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "button",
    settings: {
      text,
      link: { url, is_external: openInNewTab ? "on" : "", nofollow: nofollow ? "on" : "", custom_attributes: "" },
      size: "md"
    },
    elements: []
  };
}
function divider(): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "divider",
    settings: { style: "solid", weight: { unit: "px", size: 1 }, color: "#cccccc" },
    elements: []
  };
}
function spacer(px = 50): unknown {
  return {
    id: hexId(), elType: "widget", widgetType: "spacer",
    settings: { space: { unit: "px", size: px } }, elements: []
  };
}

function renderBlock(block: ElementorBlock): unknown {
  switch (block.type) {
    case "heading": return heading(block.text, block.level, block.align);
    case "paragraph": return textEditor(`<p>${block.html}</p>`);
    case "list": return block.style === "ordered" ? orderedList(block.items) : iconList(block.items);
    case "image": return imageWidget(block.attachmentId, block.url, block.caption);
    case "faq": return accordion(block.items);
    case "cta": return button(block.text, block.url, block.openInNewTab, block.nofollow);
    case "divider": return divider();
    case "spacer": return spacer(block.pixels);
  }
}

function wrapInSection(elements: unknown[]): unknown {
  return {
    id: hexId(), elType: "section", settings: { structure: "10" },
    elements: [{
      id: hexId(), elType: "column",
      settings: { _column_size: 100, _inline_size: null },
      elements, isInner: false
    }],
    isInner: false
  };
}

export interface ElementorDocument {
  dataJson: string;
  editMode: "builder";
  templateType: "wp-post" | "wp-page";
  version: string;
  faqPairs?: Array<{ question: string; answer: string }>;
}

export interface CreatePostInput {
  title: string;
  blocks: ElementorBlock[];
  slug?: string;
  excerpt?: string;
  status?: "draft" | "publish" | "pending" | "future" | "private";
  type?: "post" | "page";
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number;
}

export class ElementorAdapter {
  private readonly version: string;
  constructor(private readonly opts: ElementorAdapterOptions) {
    this.version = opts.engineVersion ?? "3.35.0";
  }
  buildDocument(blocks: ElementorBlock[], templateType: "wp-post" | "wp-page" = "wp-post"): ElementorDocument {
    const elements = blocks.map(renderBlock);
    const sections = [wrapInSection(elements)];
    const faqPairs = blocks
      .filter((b): b is Extract<ElementorBlock, { type: "faq" }> => b.type === "faq")
      .flatMap((b) => b.items);
    return {
      dataJson: JSON.stringify(sections),
      editMode: "builder",
      templateType,
      version: this.version,
      faqPairs: faqPairs.length > 0 ? faqPairs : undefined
    };
  }
  async createPost(input: CreatePostInput): Promise<{
    id: number; link: string; editLink: string;
    faqPairs?: Array<{ question: string; answer: string }>;
  }> {
    const doc = this.buildDocument(input.blocks, input.type === "page" ? "wp-page" : "wp-post");
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
        _elementor_data: doc.dataJson,
        _elementor_edit_mode: doc.editMode,
        _elementor_template_type: doc.templateType,
        _elementor_version: doc.version,
        _elementor_page_settings: ""
      }
    });
    return {
      id: created.id,
      link: created.link,
      editLink: `post.php?post=${created.id}&action=elementor`,
      faqPairs: doc.faqPairs
    };
  }
}
