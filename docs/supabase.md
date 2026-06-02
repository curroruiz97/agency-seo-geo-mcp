# Supabase Setup

## Current Project

```text
Project ref: bfidzlbmkpegnndijosw
Region: eu-west-1
Use: managed Postgres for Agency SEO/GEO MCP
```

## Required URLs

App/runtime connection:

```env
DATABASE_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Prisma migration connection:

```env
DIRECT_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

The password must live only in `.env` on the machine/server. Never commit it.

## Current Schema

Two Prisma migrations build 15 tables.

`20260513235000_init_project_registry`:

- `clients`
- `projects`
- `project_capabilities`
- `project_credentials`
- `opportunities`
- `change_requests`
- `action_logs`
- `reports`

`20260602120000_add_extract_layer`:

- `extraction_runs`
- `keywords`
- `keyword_snapshots`
- `audit_findings`
- `competitors`
- `content_gaps`
- `content_drafts`

Seed creates:

- 1 pilot client
- 3 pilot projects (2 active, 1 paused — so `list_projects` returns 2 by default)

## Commands

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

## Readiness

The app reports:

```text
database: configured
```

when `DATABASE_URL` exists and does not contain `REPLACE_WITH_SUPABASE_DB_PASSWORD`.

If Supabase is valid but `/ready` says `not_configured`, PM2 is probably not loading the expected environment.

## Supabase MCP

Supabase MCP is useful for development/admin work only. It is not the same thing as the Agency SEO/GEO MCP.

Use it carefully:

- project-scoped,
- read-only where possible,
- never with broad write access to production client data.

## Growth Guardrails

- Keep logs compact.
- Store summarized payloads by default.
- Use retention policies for logs and cache tables.
- Do not store full HTML, bulky audits or Elementor JSON until retention is designed.
