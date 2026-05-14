# Changelog

## 0.3.0 - Unreleased

- Add a broad MCP action surface for ChatGPT connector discovery.
- Add safe write tools that create internal change requests instead of touching external systems while read-only.
- Add placeholder read tools for WordPress, Rank Math, SE Ranking, Google Search Console and Google Analytics.

## 0.2.0

- Rework roadmap around VPS compute plus Supabase-managed Postgres.
- Add professional foundation phase before VPS deployment.
- Add Prisma schema for Supabase Postgres.
- Add modular app context and MCP tool registration.
- Add HTTP hardening, `/ready`, `/version`, Docker healthcheck and CI.
- Document current Plesk/nginx + PM2 deployment at `https://lava.avenuemedia.io`.
- Add Supabase migration and seed workflow.
- Add `HOST=127.0.0.1` deployment guidance for PM2.

## 0.1.0

- Initial MCP server foundation.
- Express HTTP server with `/health` and `/mcp`.
- Mock MCP tools: `ping`, `list_projects`, `get_server_status`.
- Docker Compose and Caddy baseline.
