# Deployment Runbook

## Preflight

- DNS points `mcp.yourdomain.com` to the VPS.
- Docker and Docker Compose are installed.
- Caddy is installed or deployed as the reverse proxy.
- Supabase project exists.
- `.env` contains production values.

## Required Production Environment

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://mcp.yourdomain.com
READ_ONLY_MODE=true
REQUIRE_MCP_AUTH=true
MCP_BEARER_TOKEN=<long-random-token>
DATABASE_URL=<supabase-pooler-url>
DIRECT_DATABASE_URL=<supabase-direct-url-for-migrations>
```

## Deploy

```bash
git pull
npm ci
npm run check
docker compose up -d --build
curl https://mcp.yourdomain.com/health
curl https://mcp.yourdomain.com/ready
```

## Rollback

```bash
git checkout <previous-tag>
docker compose up -d --build
```

## Logs

```bash
docker logs --tail 200 agency-seo-geo-mcp
```
