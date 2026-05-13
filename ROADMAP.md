# Agency SEO/GEO MCP Roadmap

This repository starts with Sprint 1 only: a safe, read-only MCP server foundation.

## Sprint 1

- Express HTTP server.
- MCP Streamable HTTP endpoint at `/mcp`.
- Public healthcheck at `/health`.
- Mock read-only tools:
  - `ping`
  - `list_projects`
  - `get_server_status`
- Docker Compose deployment target for an IONOS VPS behind Caddy.

## Later Sprints

- Sprint 2: PostgreSQL, Prisma and encrypted project registry.
- Sprint 3: WordPress read-only client.
- Sprint 4: SE Ranking read-only integration and cache.
- Sprint 5: Rank Math read-only bridge.

No real customer credentials or write actions belong in Sprint 1.
