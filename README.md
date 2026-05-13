# Agency SEO/GEO MCP

Servidor MCP central para una agencia SEO/GEO. Esta primera versión implementa solo el Sprint 1: infraestructura segura, read-only y sin datos reales.

## Qué Incluye

- Express + TypeScript + Node 22.
- MCP remoto en `/mcp` usando `@modelcontextprotocol/sdk` estable.
- Healthcheck público en `/health`.
- Tools mock:
  - `ping`
  - `list_projects`
  - `get_server_status`
- Docker Compose preparado para VPS IONOS.
- Caddy preparado para HTTPS en `mcp.tudominio.com`.
- `READ_ONLY_MODE=true` por defecto.
- Validación de `Origin` y bearer token opcional para `/mcp`.

## Desarrollo Local

```bash
npm install
cp .env.example .env
npm run dev
```

Healthcheck:

```bash
curl http://localhost:3000/health
```

Scripts:

```bash
npm run typecheck
npm test
npm run build
```

## Variables De Entorno

```env
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://mcp.tudominio.com
READ_ONLY_MODE=true
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
MCP_BEARER_TOKEN=
LOG_LEVEL=info
```

`MCP_BEARER_TOKEN` vacío deja `/mcp` sin bearer token. En VPS público conviene definirlo.

## Despliegue VPS

1. Copia el repo al VPS.
2. Crea `.env` desde `.env.example`.
3. Cambia `PUBLIC_BASE_URL` y el dominio en `Caddyfile`.
4. Levanta el servicio:

```bash
docker compose up -d --build
```

5. Configura Caddy con el `Caddyfile` del repo o integra el bloque en tu Caddy existente.
6. Comprueba:

```bash
curl https://mcp.tudominio.com/health
```

## Conectar En ChatGPT

1. Activa Developer Mode en ChatGPT.
2. Ve a Settings -> Connectors -> Create.
3. Usa como Connector URL:

```text
https://mcp.tudominio.com/mcp
```

4. ChatGPT debería detectar `ping`, `list_projects` y `get_server_status`.
5. Si cambias tools o descripciones, refresca metadata del connector.

## Límites Del Sprint 1

- No hay base de datos.
- No hay credenciales reales.
- No hay integración WordPress, SE Ranking, Rank Math ni Elementor.
- No hay acciones de escritura.

La siguiente fase añade PostgreSQL, Prisma y Project Registry cifrado.
