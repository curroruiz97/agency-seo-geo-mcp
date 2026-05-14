import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/env.js";

export const AVENUE_AI_WIDGET_URI = "ui://widget/avenue-ai-v1.html";

const widgetDescription =
  "Avenue AI shows the latest SEO/GEO MCP tool result in a compact interactive panel for reviewing structured data.";

export function registerAvenueAppResource(server: McpServer, config: Pick<AppConfig, "PUBLIC_BASE_URL">) {
  const baseUrl = config.PUBLIC_BASE_URL.replace(/\/$/, "");

  registerAppResource(
    server,
    "Avenue AI Widget",
    AVENUE_AI_WIDGET_URI,
    {
      title: "Avenue AI",
      description: widgetDescription,
      _meta: {
        ui: {
          prefersBorder: true,
          domain: baseUrl,
          csp: {
            connectDomains: [baseUrl],
            resourceDomains: [],
            frameDomains: []
          }
        },
        "openai/widgetDescription": widgetDescription
      }
    },
    async () => {
      const html = buildWidgetHtml();

      return {
        contents: [
          {
            uri: AVENUE_AI_WIDGET_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                prefersBorder: true,
                domain: baseUrl,
                csp: {
                  connectDomains: [baseUrl],
                  resourceDomains: [],
                  frameDomains: []
                }
              },
              "openai/widgetDescription": widgetDescription
            }
          }
        ]
      };
    }
  );
}

function buildWidgetHtml() {
  const js = readBuiltAsset(
    "web/dist/avenue-ai-widget.js",
    "const root=document.getElementById('avenue-ai-root');if(root){root.textContent='Avenue AI widget bundle missing. Run npm run build.';}"
  );
  const css = readBuiltAsset(
    "web/dist/avenue-ai-widget.css",
    "body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#111827}"
  );

  return `
<div id="avenue-ai-root"></div>
<style>${css}</style>
<script type="module">${js.replaceAll("</script", "<\\/script")}</script>
  `.trim();
}

function readBuiltAsset(path: string, fallback: string) {
  try {
    return readFileSync(resolve(process.cwd(), path), "utf8");
  } catch {
    return fallback;
  }
}
