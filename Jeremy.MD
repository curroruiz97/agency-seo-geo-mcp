# Jeremy.MD

# Guia Actual Del Proyecto Agency SEO/GEO MCP

Este documento explica el estado real del proyecto y que hacer desde aqui, paso a paso, sin asumir conocimientos avanzados de IA o infraestructura.

## 1. Que Es Este Proyecto

El proyecto crea un servidor MCP. MCP es una forma de darle herramientas a ChatGPT para que pueda consultar sistemas externos de forma controlada.

En este caso, el MCP sera el centro operativo SEO/GEO de una agencia:

```text
ChatGPT
  -> Agency SEO/GEO MCP
  -> Supabase
  -> WordPress / Rank Math / SE Ranking en fases futuras
```

Ahora mismo no debe escribir en WordPress. Primero solo debe leer, diagnosticar y proponer.

## 2. Estado Real Actual

La app esta desplegada en:

```text
https://lava.avenuemedia.io
```

En el VPS esta en:

```text
/var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
```

Se ejecuta con:

```text
Plesk/nginx + Node.js gestionado desde Plesk
```

No se esta usando Docker en produccion.
No se esta usando Caddy en produccion.

Docker y Caddy pueden quedar para local o futuro, pero el camino actual correcto es Plesk/nginx + Node.js desde el panel de Plesk.

## 3. Que Ya Funciona

El codigo tiene:

- `/health`
- `/ready`
- `/version`
- `/mcp`
- 57 tools MCP publicadas para ChatGPT
- herramienta `search`
- herramienta `fetch`
- widget ChatGPT App en `ui://widget/avenue-ai-v1.html`
- bundle web en `web/src` compilado con `npm run build:widget`
- CSP y domain declarados para el widget
- descriptors completos de tools: nombre, titulo, descripcion, parametros, output y annotations
- respuestas de tools con `structuredContent`
- Prisma
- Supabase schema
- migracion inicial
- seed de 3 proyectos piloto
- soporte para `HOST=127.0.0.1`

## 4. Que Falta Confirmar Ahora

Antes de conectar ChatGPT, hay que cerrar estos puntos:

1. Plesk Node.js debe cargar `DATABASE_URL`.
2. Plesk Node.js debe cargar `DIRECT_URL`.
3. `/ready` debe devolver `database: configured`.
4. Node debe escuchar en `127.0.0.1:3000`, no en `0.0.0.0:3000`.
5. La URL `http://212.227.90.205:3000` no debe responder desde fuera.

## 5. Variables Que Debe Tener El VPS

En el `.env` del VPS:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=https://lava.avenuemedia.io
READ_ONLY_MODE=true
ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
REQUIRE_MCP_AUTH=true
ALLOW_PUBLIC_MCP_DISCOVERY=true
MCP_BEARER_TOKEN=<TOKEN_ALEATORIO>
LOG_LEVEL=info
DATABASE_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.bfidzlbmkpegnndijosw:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

`<PASSWORD>` es la password real de Supabase. No la subas a GitHub. No la pegues en chats.

## 6. Comandos Para Ejecutar En El VPS

Entrar en la carpeta:

```bash
cd /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
```

Actualizar codigo:

```bash
git pull origin main
```

Instalar y compilar:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build
```

Reiniciar la app en Plesk:

```bash
mkdir -p tmp
touch tmp/restart.txt
```

Tambien puedes usar el boton `Restart App` en la pantalla Node.js de Plesk.

## 7. Comprobar Que Plesk Tiene Las Variables

En Plesk, revisar la pantalla Node.js del dominio y confirmar que las variables existen. Si se revisa por terminal, no imprimas passwords completas.

```bash
grep -E 'HOST|PORT|PUBLIC_BASE_URL|DATABASE_URL|DIRECT_URL|READ_ONLY_MODE|ALLOW_PUBLIC_MCP_DISCOVERY' .env
```

Debe aparecer:

```text
HOST=127.0.0.1
DATABASE_URL=...
DIRECT_URL=...
READ_ONLY_MODE=true
```

No hace falta imprimir la password completa.

## 8. Comprobar Que Node No Esta Expuesto

En el VPS:

```bash
ss -lntp | grep 3000
```

Bien:

```text
127.0.0.1:3000
```

Mal:

```text
0.0.0.0:3000
```

No ejecutes comandos de firewall agresivos sin revisar Plesk. Primero arregla `HOST=127.0.0.1`.

## 9. Comprobar Endpoints

Interno:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/version
```

Publico:

```bash
curl https://lava.avenuemedia.io/health
curl https://lava.avenuemedia.io/ready
curl https://lava.avenuemedia.io/version
```

Lo importante:

```text
/ready -> database: configured
```

## 10. Probar MCP

```bash
curl -s https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Deben salir muchas tools. Como minimo:

- `ping`
- `get_server_status`
- `search`
- `fetch`
- `list_projects`
- `list_sites`
- `get_post`
- `update_post`
- `update_page`
- `update_rankmath_metadata`
- `seranking_get_keyword_positions`
- `gsc_get_search_performance`
- `ga_get_traffic_overview`

En la version `0.4.0`, el servidor debe devolver 57 tools. Todas deben tener metadata completa para ChatGPT:

```text
name
title
description
inputSchema
outputSchema
annotations
_meta.ui.resourceUri
openai/outputTemplate
```

Tambien debe existir el recurso UI:

```bash
curl -s https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"ui://widget/avenue-ai-v1.html"}}'
```

Si el comando anterior devuelve 57 tools pero ChatGPT Builder sigue diciendo que hay 0 acciones, lo mas probable es cache/indexacion del conector antiguo. La solucion practica es borrar ese conector y crear uno nuevo con la misma URL:

```text
https://lava.avenuemedia.io/mcp
```

Si hay bearer token en el MCP, deja `ALLOW_PUBLIC_MCP_DISCOVERY=true`. Asi ChatGPT puede leer el catalogo de acciones y el widget (`initialize`, `tools/list`, `resources/list`, `resources/read`) aunque las ejecuciones reales (`tools/call`) sigan protegidas por `MCP_BEARER_TOKEN`.

Despues probar `list_projects`. Debe devolver los 2 proyectos activos si Supabase esta cargado (el seed crea 3, pero uno queda en `paused` y el filtro por defecto es `active`).

Tambien puedes probar una escritura segura como `update_post`. No debe tocar WordPress. Debe crear una propuesta interna/change request o indicar por que no puede persistirla.

## 11. Cuando Conectar ChatGPT

Solo conectar ChatGPT cuando:

- `https://lava.avenuemedia.io/health` funciona.
- `https://lava.avenuemedia.io/version` devuelve `0.4.0`.
- `https://lava.avenuemedia.io/ready` devuelve `database: configured`.
- `https://lava.avenuemedia.io/mcp` lista 57 tools.
- `resources/read` devuelve `ui://widget/avenue-ai-v1.html`.
- `http://212.227.90.205:3000` no responde desde fuera.

Connector URL:

```text
https://lava.avenuemedia.io/mcp
```

## 12. Que NO Hacer Todavia

No hacer todavia:

- escritura en WordPress,
- plugin WordPress,
- Rank Math writes,
- Elementor writes,
- publicaciones automaticas,
- cambios de slugs,
- redirecciones,
- canonicals,
- robots.

Aunque el MCP publique acciones de escritura, por seguridad ahora son propuestas internas. Esto es intencionado para que ChatGPT vea acciones utilizables sin dar permiso real de modificar webs.

## 13. Siguiente Fase Real

Cuando ChatGPT ya vea las tools, el siguiente desarrollo es:

```text
WordPress read-only
```

Primero se implementa:

- guardar credenciales cifradas,
- leer paginas,
- leer posts,
- leer HTML renderizado,
- extraer H1/H2/H3,
- extraer enlaces internos.

Despues:

- SE Ranking read-only,
- Rank Math read-only,
- plugin bridge solo si hace falta.

## 14. Regla De Oro

```text
Leer primero.
Diagnosticar despues.
Proponer antes de tocar.
Aprobar antes de escribir.
Verificar siempre.
```
