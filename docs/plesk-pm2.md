# Plesk/nginx + PM2 Deployment

This is the source of truth for the current VPS deployment.

## Current Target

```text
Public URL: https://lava.avenuemedia.io
App path: /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
Node internal URL: http://127.0.0.1:3000
Process manager: PM2
Reverse proxy: Plesk/nginx
Database: Supabase Postgres
Supabase ref: bfidzlbmkpegnndijosw
```

## Known State

Completed:

- Plesk Git deploy pulled commit `a68ad70` or newer.
- Build uses `config.HOST`.
- `.env` has been rewritten with `HOST=127.0.0.1`.
- Plesk/nginx handles HTTPS.

Still to verify on VPS:

- PM2 actually loaded `HOST=127.0.0.1`.
- PM2 actually loaded `DATABASE_URL` and `DIRECT_URL`.
- `/ready` returns `database: configured`.
- Port `3000` is not reachable from the public IP.

## Required Environment

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
DATABASE_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

Do not print or paste the password. Mask it when checking.

## Check PM2 Environment

```bash
pm2 list
pm2 env <PM2_ID> | grep -E 'HOST|PORT|PUBLIC_BASE_URL|DATABASE_URL|DIRECT_URL|READ_ONLY_MODE'
```

You should see:

```text
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=https://lava.avenuemedia.io
DATABASE_URL=...
DIRECT_URL=...
READ_ONLY_MODE=true
```

## Apply DB And Restart

From the app directory:

```bash
cd /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
pm2 restart agency-seo-geo-mcp --update-env
pm2 save
```

## Verify Binding

```bash
ss -lntp | grep 3000
```

Good:

```text
127.0.0.1:3000
```

Bad:

```text
0.0.0.0:3000
```

Do not run broad firewall commands unless you know the Plesk firewall setup. Prefer fixing `HOST=127.0.0.1`.

## Verify Endpoints

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/version
curl https://lava.avenuemedia.io/health
curl https://lava.avenuemedia.io/ready
curl https://lava.avenuemedia.io/version
```

Expected:

```json
{"status":"ready","database":"configured"}
```

## Verify MCP

```bash
curl -s https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected tools:

- `ping`
- `get_server_status`
- `list_projects`
- `list_sites`
- WordPress tools like `get_post`, `update_post`, `create_post`
- Rank Math tools like `update_rankmath_metadata`
- SE Ranking tools like `seranking_get_keyword_positions`
- Google tools like `gsc_get_search_performance` and `ga_get_traffic_overview`

## Public Port Check

From outside the VPS, `http://212.227.90.205:3000` should not respond.

If it still responds:

1. Confirm PM2 loaded `HOST=127.0.0.1`.
2. Restart with `pm2 restart ... --update-env`.
3. Recheck `ss -lntp | grep 3000`.
4. Only then consider a Plesk-safe firewall adjustment.
