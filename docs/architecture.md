# Architecture

## Runtime Topology

```text
ChatGPT
  -> HTTPS /mcp
  -> Caddy on IONOS VPS
  -> Agency SEO/GEO MCP container
  -> Supabase Cloud Postgres
  -> WordPress / Rank Math / SE Ranking
```

The VPS owns compute and public routing. Supabase owns managed Postgres. WordPress sites remain separate customer systems.

## Main Modules

- `src/server`: HTTP routes, security middleware and MCP transport.
- `src/app`: dependency composition.
- `src/mcp-tools`: MCP tool registration by feature group.
- `src/domain`: business types and interfaces.
- `src/db`: Prisma client and repositories.
- `prisma`: database schema and migrations.

## Data Policy

- Store operational data in Supabase Postgres.
- Never return credentials through MCP tools.
- Encrypt credentials in the application before writing to the database.
- Keep logs compact and redact secrets.
- Store large rendered HTML, Elementor JSON or bulky snapshots only with explicit retention rules.

## Supabase Policy

Use Supabase Free for development and pilot setup. Upgrade to Pro before production client data depends on the database. Use the Supabase MCP server only as a developer/admin tool, project-scoped and read-only whenever real data exists.
