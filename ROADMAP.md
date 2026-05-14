# Agency SEO/GEO MCP Roadmap

## Objetivo

Construir un servidor MCP central para gestionar SEO/GEO de proyectos WordPress con Elementor, Rank Math Pro y SE Ranking, empezando por lectura segura y propuestas antes de cualquier escritura.

## Arquitectura Actual

```text
ChatGPT
  -> https://lava.avenuemedia.io/mcp
  -> Plesk/nginx HTTPS proxy
  -> Plesk Node.js en 127.0.0.1:3000
  -> Agency SEO/GEO MCP
  -> Supabase Cloud Postgres
  -> WordPress / Rank Math / SE Ranking en fases posteriores
```

Docker y Caddy quedan como alternativa local/infra futura, pero el despliegue real actual es Plesk/nginx + Node.js gestionado desde Plesk.

## Estado Actual Del Proyecto

Completado:

- Servidor Express + TypeScript.
- MCP Streamable HTTP en `/mcp`.
- `/health`, `/ready`, `/version`.
- Tools `ping`, `get_server_status`, `list_projects`.
- Modularizacion con `AppContext`, dominio `projects`, repositorios mock/Prisma.
- Prisma schema para Supabase.
- Migracion inicial y seed piloto en el repo.
- Supabase project ref `bfidzlbmkpegnndijosw`.
- GitHub Actions CI.
- Hardening basico: Helmet, rate limit, request id, errores saneados, `HOST`.
- Despliegue actual en `https://lava.avenuemedia.io`.
- Version actual `0.4.0`.
- Capa ChatGPT App:
  - recurso UI `ui://widget/avenue-ai-v1.html`
  - widget `web/src` compilado con esbuild
  - MIME `text/html;profile=mcp-app`
  - CSP y domain declarados
  - `_meta.ui.resourceUri` y `openai/outputTemplate` en las tools
- Superficie MCP amplia de 41 acciones para que ChatGPT detecte el conector:
  - WordPress
  - Rank Math
  - SE Ranking
  - Google Search Console
  - Google Analytics
  - `search` y `fetch` para compatibilidad con conocimiento/conectores
- Tool descriptors compatibles con ChatGPT Apps/Builder: `title`, `description`, `inputSchema`, `outputSchema`, `annotations` y `structuredContent`.
- Escrituras seguras como propuestas internas/change requests, sin cambios externos.

Pendiente inmediato:

- Confirmar en VPS que Plesk Node.js carga `DATABASE_URL` y `DIRECT_URL`.
- Confirmar que `/ready` devuelve `database: configured`.
- Confirmar que Node escucha solo en `127.0.0.1:3000`.
- Confirmar que la IP publica no expone `:3000`.
- Conectar ChatGPT a `https://lava.avenuemedia.io/mcp`.

## Politicas De Seguridad

- `READ_ONLY_MODE=true` hasta tener approvals, snapshots y rollback.
- No guardar credenciales en claro.
- No devolver credenciales por MCP.
- No conectar datos reales sin autenticacion compatible.
- Permitir descubrimiento publico MCP (`initialize`, `tools/list`, `resources/list`, `resources/read`) cuando `ALLOW_PUBLIC_MCP_DISCOVERY=true`, manteniendo `tools/call` protegido con bearer token.
- No aplicar cambios WordPress/Rank Math/Elementor hasta fases posteriores.
- Elementor es solo lectura hasta que exista staging, diff y verificacion.

## Fase 0: Foundation MCP

Estado: completada.

Incluye servidor MCP, endpoints de salud, Docker local, Plesk Node.js deployment support, CI y documentacion.

## Fase 1: Cierre Del Despliegue Actual

Estado: en curso.

Objetivo:

- Dejar `lava.avenuemedia.io` listo para conectar ChatGPT.

Tareas:

- Verificar variables en Plesk Node.js.
- Ejecutar `npm run db:generate`, `npm run db:deploy`, `npm run db:seed` en VPS si no se hizo alli.
- Reiniciar la app desde Plesk Node.js o con `touch tmp/restart.txt`.
- Verificar `/ready` en local y dominio.
- Confirmar `ss -lntp | grep 3000` mostrando `127.0.0.1:3000`.
- Probar `/mcp` `tools/list` y confirmar 41 tools.
- Probar `resources/list` y `resources/read` para el widget.

Criterios de aceptacion:

- `https://lava.avenuemedia.io/health` OK.
- `https://lava.avenuemedia.io/ready` devuelve `database: configured`.
- `https://lava.avenuemedia.io/version` devuelve `0.4.0`.
- `https://lava.avenuemedia.io/mcp` lista 41 tools MCP con annotations completas y UI template.
- `http://212.227.90.205:3000` no es accesible desde fuera.

## Fase 2: Conexion ChatGPT

Objetivo:

- Crear el connector MCP en ChatGPT usando `https://lava.avenuemedia.io/mcp`.

Tareas:

- Probar `ping`.
- Probar `get_server_status`.
- Probar `list_projects`.
- Probar que `tools/list` muestra 41 acciones.
- Probar una accion de escritura segura, por ejemplo `update_post`, y confirmar que crea propuesta sin tocar WordPress.
- Confirmar si ChatGPT necesita auth adicional.
- Si Builder muestra 0 acciones pese a que `tools/list` devuelve 41, borrar el conector antiguo y crear uno nuevo para evitar metadata cacheada.

Criterios:

- ChatGPT detecta las 41 tools.
- `list_projects` devuelve los 3 proyectos seed desde Supabase.
- ChatGPT no muestra el MCP vacio en el editor.

## Fase 3: WordPress Read-Only

Objetivo:

- Leer contenido real de WordPress sin escribir nada.

Tareas:

- Crear modelo de credenciales cifradas.
- Implementar cifrado en aplicacion.
- Implementar `WordpressClient`.
- Tools:
  - `wp_get_site_info`
  - `wp_list_pages`
  - `wp_list_posts`
  - `wp_get_content`
- Extraer headings, enlaces internos y HTML renderizado.

Criterios:

- Un proyecto piloto puede leer paginas reales.
- No hay escritura.
- No se exponen credenciales.

## Fase 4: SE Ranking Read-Only

Objetivo:

- Incorporar rankings y oportunidades basicas.

Tareas:

- Implementar `SerankingClient`.
- Guardar snapshots/cache.
- Detectar quick wins posiciones 4-15.
- Persistir oportunidades.

## Fase 5: Rank Math Read-Only

Objetivo:

- Leer y evaluar metadata SEO.

Tareas:

- Evaluar primero REST/headless disponible.
- Crear plugin bridge solo si hace falta para Rank Math/snapshots.
- Implementar lectura de title, description, focus keyword y head.

## Fase 6: Plugin WordPress Bridge

Objetivo:

- Crear un plugin pequeno y seguro, no un plugin gigante.

Endpoints futuros:

```text
GET  /wp-json/agency-seo/v1/status
GET  /wp-json/agency-seo/v1/rankmath/meta/{post_id}
POST /wp-json/agency-seo/v1/snapshots/{post_id}
GET  /wp-json/agency-seo/v1/elementor/status/{post_id}
```

Escritura se deja para otra fase.

## Fase 7: Approvals Y Escritura Controlada

Objetivo:

- Pasar de propuesta a cambio aplicado con aprobacion humana.

Tareas:

- Change requests.
- Snapshots.
- Approval/reject.
- Aplicar solo cambios Rank Math low-risk.
- Verificar despues de aplicar.
- Rollback cuando sea posible.

## Fase 8: GEO, Reporting Y Escalado

Objetivo:

- Informes SEO/GEO y priorizacion semanal.

Tareas:

- GEO score.
- Answer blocks.
- FAQ recommendations.
- Weekly global report.
- Monthly client report.
- Escalar a proyectos reales.
