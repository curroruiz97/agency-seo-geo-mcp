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

Already modeled in Prisma:

- clients
- projects
- project_capabilities
- project_credentials
- opportunities
- change_requests
- action_logs
- reports

## Security Policy

- Node should bind to `HOST=127.0.0.1` in VPS.
- Public traffic must enter through `https://lava.avenuemedia.io`.
- `READ_ONLY_MODE=true` remains mandatory.
- Credentials must be encrypted before being written to DB.
- MCP tools must never return secrets.
- Real client data should not be exposed before the auth story is finalized.

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
