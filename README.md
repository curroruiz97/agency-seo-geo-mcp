# Agency SEO/GEO MCP

Servidor MCP central para una agencia SEO/GEO. La arquitectura recomendada usa el VPS IONOS para ejecutar el MCP y Supabase Cloud como Postgres gestionado.

## Que Incluye

- Express + TypeScript + Node 22.
- MCP remoto en `/mcp` usando `@modelcontextprotocol/sdk` estable.
- Healthcheck publico en `/health`.
- Readiness endpoint en `/ready`.
- Version endpoint en `/version`.
- Tools mock:
  - `ping`
  - `list_projects`
  - `get_server_status`
- Docker Compose preparado para VPS IONOS.
- Caddy preparado para HTTPS en `mcp.tudominio.com`.
- `READ_ONLY_MODE=true` por defecto.
- Validacion de `Origin`, Helmet, rate limit y bearer token opcional para `/mcp`.
- Prisma preparado para Supabase Postgres.
- CI con GitHub Actions.

## Desarrollo Local

```bash
npm install
cp .env.example .env
npm run dev
```

Healthcheck:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/version
```

Scripts:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

## Variables De Entorno

```env
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://mcp.tudominio.com
READ_ONLY_MODE=true
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
REQUIRE_MCP_AUTH=true
MCP_BEARER_TOKEN=
LOG_LEVEL=info
DATABASE_URL=
DIRECT_URL=
```

Si `REQUIRE_MCP_AUTH=true`, el servidor no arranca sin `MCP_BEARER_TOKEN`.

## Supabase

Empieza con Supabase Free para desarrollo y piloto. Antes de usar datos reales de clientes en produccion, sube a Pro para evitar pausas y tener mejores backups.

Usa:

- `DATABASE_URL`: connection string del pooler de Supabase para la app.
- `DIRECT_URL`: connection string directa para migraciones cuando este disponible. Es el nombre que muestra Supabase para Prisma.

Generar Prisma Client:

```bash
npm run db:generate
```

Aplicar migraciones en despliegue:

```bash
npm run db:deploy
```

Insertar datos piloto despues de aplicar migraciones:

```bash
npm run db:seed
```

## Despliegue VPS

1. Crea `.env` desde `.env.example`.
2. Cambia `PUBLIC_BASE_URL` y el dominio en `Caddyfile`.
3. Define `MCP_BEARER_TOKEN` con un token largo.
4. Define `DATABASE_URL` con Supabase cuando empiece Sprint 2 real.
5. Levanta el servicio:

```bash
docker compose up -d --build
```

6. Comprueba:

```bash
curl https://mcp.tudominio.com/health
curl https://mcp.tudominio.com/ready
```

## Conectar En ChatGPT

1. Activa Developer Mode en ChatGPT.
2. Ve a Settings -> Connectors -> Create.
3. Usa como Connector URL:

```text
https://mcp.tudominio.com/mcp
```

4. ChatGPT deberia detectar `ping`, `list_projects` y `get_server_status`.
5. Si cambias tools o descripciones, refresca metadata del connector.

## Limites Actuales

- Hay schema Prisma, pero aun no hay migracion aplicada ni repositorio DB activo.
- No hay credenciales reales.
- No hay integracion WordPress, SE Ranking, Rank Math ni Elementor.
- No hay acciones de escritura.

La siguiente fase cambia `list_projects` de mock a Supabase Postgres.
