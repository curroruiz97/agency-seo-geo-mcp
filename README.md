# Agency SEO/GEO MCP

Servidor MCP central para una agencia SEO/GEO. El despliegue real actual usa **Plesk/nginx + PM2 + Node.js** en el VPS IONOS, con **Supabase Cloud Postgres** como base de datos gestionada.

## Estado Actual

- Version de app: `0.2.0`.
- Produccion/staging publico actual: `https://lava.avenuemedia.io`.
- Ruta en VPS: `/var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app`.
- Proceso: PM2.
- Proxy HTTPS: Plesk/nginx.
- Node debe escuchar internamente en `127.0.0.1:3000`.
- Docker y Caddy existen en el repo como soporte/local/alternativa, pero **no son la ruta activa de despliegue**.
- Supabase project ref: `bfidzlbmkpegnndijosw`.
- `READ_ONLY_MODE=true` debe mantenerse hasta que existan approvals, snapshots y verificacion.

## Endpoints

```text
GET  /health
GET  /ready
GET  /version
POST /mcp
GET  /mcp
```

Checks esperados:

```bash
curl https://lava.avenuemedia.io/health
curl https://lava.avenuemedia.io/ready
curl https://lava.avenuemedia.io/version
```

`/ready` debe devolver `database: configured` cuando PM2 este cargando bien `DATABASE_URL`.

## MCP Tools Actuales

El MCP publica una superficie amplia de acciones para que ChatGPT pueda detectar el conector como utilizable.

Base:

- `ping`
- `get_server_status`
- `list_projects`
- `list_sites`

WordPress:

- `get_post`
- `list_posts`
- `list_pages`
- `create_post`
- `update_post`
- `update_page`
- `get_categories`
- `get_tags`
- `upload_media`

Rank Math:

- `get_rankmath_metadata`
- `update_rankmath_metadata`
- `get_focus_keywords`
- `update_focus_keywords`
- `get_schema_config`
- `update_schema_config`
- `get_redirections`
- `create_redirection`

SE Ranking:

- `seranking_get_projects`
- `seranking_get_rankings`
- `seranking_get_keyword_positions`
- `seranking_get_competitors`
- `seranking_get_site_audit`
- `seranking_get_backlinks`

Google:

- `gsc_*` para Search Console.
- `ga_*` para Analytics.

`list_projects`, `list_sites` y `seranking_get_projects` leen desde Supabase cuando `DATABASE_URL` esta configurada. Las acciones de escritura crean propuestas/change requests internos y no modifican WordPress, Rank Math ni otros sistemas externos mientras no se implementen los clientes seguros.

## Desarrollo Local

```bash
npm install
cp .env.example .env
npm run check
npm run dev
```

Comprobar local:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/version
```

## Variables Necesarias

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

No subir nunca `.env` a GitHub.

## Comandos Importantes

```bash
npm run check
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
```

En VPS, tras cambiar `.env`:

```bash
pm2 restart agency-seo-geo-mcp --update-env
pm2 save
```

## Prioridad Inmediata

1. Confirmar que PM2 carga `HOST=127.0.0.1`.
2. Confirmar que PM2 carga `DATABASE_URL` y `DIRECT_URL`.
3. Confirmar `https://lava.avenuemedia.io/ready` con `database: configured`.
4. Confirmar que `http://212.227.90.205:3000` no responde desde fuera.
5. Probar `https://lava.avenuemedia.io/mcp` desde ChatGPT.

## Limites Actuales

- Hay tools publicadas para WordPress, SE Ranking, Rank Math, GSC y GA, pero las integraciones reales siguen pendientes.
- No hay plugin WordPress activo.
- Las escrituras publicadas crean propuestas internas; no ejecutan cambios externos.
- No hay datos reales de clientes.

La siguiente fase es conectar ChatGPT al MCP y, despues, implementar WordPress read-only.
