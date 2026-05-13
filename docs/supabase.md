# Supabase Setup

## Recommended Start

Start with Supabase Free for development and pilot data. Upgrade before production dependency.

## Connection Strings

The app should use the Supabase pooler connection string:

```env
DATABASE_URL="postgresql://..."
```

For Prisma migrations, use a direct URL when available:

```env
DIRECT_DATABASE_URL="postgresql://..."
```

On IPv4-only environments, use Supabase's pooler unless an IPv4 add-on is enabled.

## MCP Usage

Supabase MCP is useful for development tasks:

- inspect tables,
- apply migrations in controlled environments,
- generate TypeScript types,
- check logs and advisors.

Do not connect Supabase MCP to production data with broad write access. Prefer:

```text
project_ref=<project>&read_only=true&features=database,docs
```

## Data Growth Guardrails

- Keep action logs compact.
- Store summarized payloads by default.
- Use retention policies for logs and cache tables.
- Do not store full HTML or Elementor JSON snapshots until a retention strategy exists.
