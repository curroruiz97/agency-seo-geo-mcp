# Deployment Runbook

The active deployment is **Plesk/nginx + PM2**, not Docker/Caddy.

Use this document for general deployment context and `docs/plesk-pm2.md` for exact operational commands.

## Active Target

```text
URL: https://lava.avenuemedia.io
App path: /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
Internal app: http://127.0.0.1:3000
Process: PM2
Proxy: Plesk/nginx
Database: Supabase
```

## Production Environment

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=https://lava.avenuemedia.io
READ_ONLY_MODE=true
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
REQUIRE_MCP_AUTH=true
MCP_BEARER_TOKEN=<TOKEN_ALEATORIO>
LOG_LEVEL=info
DATABASE_URL=<supabase-pooler-url>
DIRECT_URL=<supabase-migration-url>
```

Auth is mandatory: the server refuses to start in production without `MCP_BEARER_TOKEN` (and `REQUIRE_MCP_AUTH` defaults to `true`). Generate a token with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Only set `REQUIRE_MCP_AUTH=false` for tokenless local development.

## Deploy Or Update

```bash
cd /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
git pull origin main
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
pm2 restart agency-seo-geo-mcp --update-env
pm2 save
```

If the PM2 process has a different name, use the name from:

```bash
pm2 list
```

## Verify

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/version
curl https://lava.avenuemedia.io/health
curl https://lava.avenuemedia.io/ready
curl https://lava.avenuemedia.io/version
```

Expected:

```text
/ready -> database: configured
```

## Docker/Caddy

Docker and Caddy files remain available for local tests or future infrastructure changes. They are not the current deployment path because Plesk/nginx already owns ports `80/443`.
