# Changelog

## 0.4.0

- Add the MCP Apps layer with `@modelcontextprotocol/ext-apps`.
- Register the Avenue AI widget resource at `ui://widget/avenue-ai-v1.html` with `text/html;profile=mcp-app`.
- Add a vanilla widget bundle under `web/src` and compile it with esbuild through `npm run build:widget`.
- Attach `_meta.ui.resourceUri`, legacy `ui/resourceUri`, and `openai/outputTemplate` to every tool.
- Add CSP, widget domain, and widget description metadata.
- Add connector/company-knowledge compatible `search` and `fetch` tools.
- Allow public MCP resource discovery/read requests while keeping `tools/call` protected.

## 0.3.3

- Allow unauthenticated MCP discovery requests (`initialize`, `notifications/initialized`, `tools/list`) when `ALLOW_PUBLIC_MCP_DISCOVERY=true`.
- Keep real MCP tool execution (`tools/call`) protected by `MCP_BEARER_TOKEN`.
- Document the Builder compatibility setting for protected MCP endpoints.

## 0.3.2

- Add `GET /` as a safe service directory for browser visits to the MCP domain.
- Document the root endpoint and bump deployment verification to `0.3.2`.

## 0.3.1

- Add ChatGPT Apps/Builder-compatible tool descriptors with titles, output schemas, required annotations and invocation metadata.
- Return structured MCP tool results through `structuredContent` as well as JSON text content.
- Avoid reused Zod schema objects that can emit `$ref`/definitions in generated tool JSON schemas.
- Add descriptor tests to prevent tools from being published without ChatGPT-compatible metadata.
- Document the Builder 0-actions cache/indexing recovery path.

## 0.3.0

- Add a broad MCP action surface for ChatGPT connector discovery.
- Add safe write tools that create internal change requests instead of touching external systems while read-only.
- Add placeholder read tools for WordPress, Rank Math, SE Ranking, Google Search Console and Google Analytics.

## 0.2.0

- Rework roadmap around VPS compute plus Supabase-managed Postgres.
- Add professional foundation phase before VPS deployment.
- Add Prisma schema for Supabase Postgres.
- Add modular app context and MCP tool registration.
- Add HTTP hardening, `/ready`, `/version`, Docker healthcheck and CI.
- Document current Plesk/nginx + Node.js deployment at `https://lava.avenuemedia.io`.
- Add Supabase migration and seed workflow.
- Add `HOST=127.0.0.1` deployment guidance for Plesk Node.js.

## 0.1.0

- Initial MCP server foundation.
- Express HTTP server with `/health` and `/mcp`.
- Mock MCP tools: `ping`, `list_projects`, `get_server_status`.
- Docker Compose and Caddy baseline.
