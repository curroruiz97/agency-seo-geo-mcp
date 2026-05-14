# Plesk/nginx + PM2 Deployment

This deployment mode is used when Plesk/nginx owns ports 80 and 443 and proxies traffic to the Node.js app.

## Current Target

```text
Public URL: https://lava.avenuemedia.io
App path: /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
Node internal URL: http://127.0.0.1:3000
Process manager: PM2
Database: Supabase Postgres
```

## Required Environment

PM2 must load these variables:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=https://lava.avenuemedia.io
READ_ONLY_MODE=true
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
REQUIRE_MCP_AUTH=false
MCP_BEARER_TOKEN=
LOG_LEVEL=info
DATABASE_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

Use `REQUIRE_MCP_AUTH=false` only while validating the ChatGPT connector with non-sensitive data. Before real client data, add a proper auth flow or a connector-compatible token setup.

## Check What PM2 Loaded

```bash
pm2 list
pm2 describe agency-seo-geo-mcp
pm2 env <PM2_ID> | grep -E 'HOST|PORT|PUBLIC_BASE_URL|DATABASE_URL|DIRECT_URL|READ_ONLY_MODE'
```

Do not paste secrets into public chats. If you need to inspect URLs, mask the password.

## Restart With Updated Environment

If `.env` or ecosystem config changed:

```bash
pm2 restart agency-seo-geo-mcp --update-env
pm2 save
```

Then verify:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl https://lava.avenuemedia.io/health
curl https://lava.avenuemedia.io/ready
```

Expected:

```json
{"status":"ready","database":"configured"}
```

## Apply Supabase Migrations On VPS

From the app directory:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
pm2 restart agency-seo-geo-mcp --update-env
```

## Close Public Port 3000

Best option: make Node listen only on localhost:

```env
HOST=127.0.0.1
```

After restart, this should work:

```bash
curl http://127.0.0.1:3000/health
```

And this should not be publicly reachable from outside the VPS:

```text
http://212.227.90.205:3000
```

Also block the port at firewall level if possible:

```bash
sudo ufw deny 3000/tcp
sudo ufw status
```

On Plesk, also check firewall rules if Plesk Firewall is enabled.

## nginx/Plesk Proxy

Plesk should proxy:

```text
https://lava.avenuemedia.io -> http://127.0.0.1:3000
```

The app itself should not terminate HTTPS. Plesk/nginx does that.
