type ToolResultNotification = {
  jsonrpc: "2.0";
  method: "ui/notifications/tool-result";
  params?: {
    toolName?: string;
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type: string; text?: string }>;
  };
};

const root = document.getElementById("avenue-ai-root");

const state = {
  toolName: "Avenue AI",
  summary: "Ready to inspect SEO/GEO actions.",
  payload: {
    status: "ready",
    message: "Run an Avenue AI tool from ChatGPT to render structured results here."
  } as Record<string, unknown>
};

function render() {
  if (!root) {
    return;
  }

  root.innerHTML = `
    <main class="shell">
      <section class="topbar">
        <div>
          <p class="eyebrow">Agency SEO/GEO MCP</p>
          <h1>Avenue AI</h1>
        </div>
        <span class="status">Read-only safe mode</span>
      </section>
      <section class="panel">
        <p class="label">Latest tool</p>
        <h2>${escapeHtml(state.toolName)}</h2>
        <p class="summary">${escapeHtml(state.summary)}</p>
      </section>
      <section class="panel">
        <p class="label">Structured result</p>
        <pre>${escapeHtml(JSON.stringify(state.payload, null, 2))}</pre>
      </section>
    </main>
  `;
}

function updateFromToolResult(params: ToolResultNotification["params"]) {
  const structuredContent = params?.structuredContent;
  state.toolName = params?.toolName ?? "Avenue AI tool";
  state.payload = structuredContent ?? { status: "empty_result" };
  state.summary = getSummary(structuredContent, params?.content);
  render();
}

function getSummary(structuredContent?: Record<string, unknown>, content?: Array<{ type: string; text?: string }>) {
  if (typeof structuredContent?.message === "string") {
    return structuredContent.message;
  }

  const text = content?.find((item) => item.type === "text" && item.text)?.text;
  if (text) {
    return text.slice(0, 220);
  }

  return "Tool completed. Review the structured JSON below.";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[char] ?? char;
  });
}

window.addEventListener(
  "message",
  (event: MessageEvent<ToolResultNotification>) => {
    if (event.source !== window.parent) {
      return;
    }

    const message = event.data;
    if (!message || message.jsonrpc !== "2.0" || message.method !== "ui/notifications/tool-result") {
      return;
    }

    updateFromToolResult(message.params);
  },
  { passive: true }
);

render();
