# Architecture

## Runtime Topology

```text
ChatGPT
  -> HTTPS /mcp
  -> Plesk/nginx at https://lava.avenuemedia.io
  -> PM2 process
  -> Node.js app bound to 127.0.0.1:3000
  -> Supabase Cloud Postgres
  -> WordPress / Rank Math / SE Ranking in later phases
```

## Active Deployment

- Public domain: `https://lava.avenuemedia.io`.
- App directory on VPS: `/var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app`.
- Process manager: PM2.
- Reverse proxy and HTTPS: Plesk/nginx.
- Database: Supabase project `bfidzlbmkpegnndijosw`.

Docker and Caddy remain in the repository, but they are not the active production path.

## Main Modules

- `src/server`: HTTP routes, security middleware and MCP transport.
- `src/app`: dependency composition.
- `src/mcp-tools`: MCP tool registration by feature group.
- `src/clients`: HTTP clients for WordPress, Rank Math and SE Ranking, plus the Elementor adapter.
- `src/services`: credentials, extract, strategy, execute and content-generation services.
- `src/config`: env parsing, constants and database helpers.
- `src/app-ui`: the Avenue AI widget MCP resource.
- `src/utils`: crypto and logging helpers.
- `src/domain`: business types and interfaces.
- `src/db`: Prisma client and repositories.
- `prisma`: database schema, migrations and seed.

## Data Flow

```text
MCP tool call
  -> Express route /mcp
  -> MCP server transport
  -> tool registry
  -> AppContext
  -> repository
  -> Supabase if DATABASE_URL is configured
  -> mock repository only when DB is not configured
```

## Current Data Model

Already modeled in Prisma (15 tables across two migrations):

Project registry (`20260513235000_init_project_registry`):

- clients
- projects
- project_capabilities
- project_credentials
- opportunities
- change_requests
- action_logs
- reports

Extract layer (`20260602120000_add_extract_layer`):

- extraction_runs
- keywords
- keyword_snapshots
- audit_findings
- competitors
- content_gaps
- content_drafts

## Security Policy

- Node should bind to `HOST=127.0.0.1` in VPS.
- Public traffic must enter through `https://lava.avenuemedia.io`.
- `READ_ONLY_MODE=true` is enforced in code: `ExecuteService` refuses to apply any approved change while it is on.
- Credentials must be encrypted before being written to DB.
- MCP tools must never return secrets.
- The `/mcp` endpoint requires `MCP_BEARER_TOKEN`; the server refuses to boot in production without it. Only pre-auth discovery is public when `ALLOW_PUBLIC_MCP_DISCOVERY=true`.

## Future Integrations

1. WordPress REST read-only.
2. SE Ranking read-only.
3. Rank Math read-only.
4. WordPress bridge plugin if required.
5. Approvals and controlled writes.

## Published Tool Surface

The MCP intentionally publishes the expected SEO action surface early so ChatGPT can discover usable actions:

- WordPress read/write proposal tools.
- Rank Math read/write proposal tools.
- SE Ranking read tools.
- Google Search Console read tools.
- Google Analytics read tools.

External writes are not executed yet. Write-like tools create internal proposed change requests when Supabase is configured.
