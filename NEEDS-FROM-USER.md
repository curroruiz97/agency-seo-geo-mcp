# Lo que necesito de ti para dejar el sistema 100% funcional

Esto es la checklist exhaustiva de credenciales, accesos y decisiones
pendientes. Hasta que estos puntos estén resueltos el sistema sigue siendo
"esqueleto + lógica" pero no opera sobre los sitios reales.

## 1. Variables de entorno en el VPS (.env)

Añadir al `.env` que está en `/var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app/.env`:

```env
# Clave maestra para cifrar credenciales en BD (AES-256-GCM via scrypt).
# Genérala con: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
# CRÍTICO: si la pierdes, las credenciales cifradas en BD son irrecuperables.
SECRETS_MASTER_KEY=____

# Opcional: API key de SE Ranking account-wide. Solo la lee el script
# scripts/seed-sites.mjs; el SERVIDOR no usa esta variable (en runtime la
# credencial se registra cifrada con la tool register_seranking_key).
SERANKING_API_KEY=____
```

Después de editar:
```bash
node /var/www/vhosts/avenuemedia.io/tools/pm2/node_modules/pm2/bin/pm2 delete lava-mcp
node /var/www/vhosts/avenuemedia.io/tools/pm2/node_modules/pm2/bin/pm2 start dist/src/index.js --name lava-mcp --cwd /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
node /var/www/vhosts/avenuemedia.io/tools/pm2/node_modules/pm2/bin/pm2 save
```

## 2. Migración de BD

Aplicar la migración con los modelos nuevos:

```bash
cd /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
npx prisma migrate deploy
```

Esto crea las tablas: `extraction_runs`, `keywords`, `keyword_snapshots`,
`audit_findings`, `competitors`, `content_gaps`, `content_drafts`.

## 3. Inventario de sitios (CSV/JSON)

Necesito que prepares un fichero `sites.json` con un objeto por cada uno de los
30-40 sitios. Cada objeto:

```jsonc
{
  "clientName": "Cliente Demo SL",           // agrupa varios proyectos
  "clientCompany": "Cliente Demo SL",
  "clientEmail": "contacto@clientedemo.com",
  "name": "Restaurante Las Acacias",         // nombre del sitio
  "domain": "lasacacias.com",                // único, sin https
  "wordpressUrl": "https://lasacacias.com",
  "serankingProjectId": "1234567",           // de SE Ranking → URL del proyecto
  "language": "es",
  "targetCountry": "ES",
  "targetCity": "Madrid",                    // opcional
  "sector": "restauracion",                  // opcional
  "permissionLevel": "proposal_only",        // read_only | proposal_only | approved_writes

  "capabilities": {
    "canCreateDrafts": true,
    "canUpdateRankmath": true,
    "canUpdateElementor": false,             // por defecto false: requiere validación humana
    "canPublish": false,                     // false → drafts siempre
    "canChangeSlugs": false,
    "canChangeCanonical": false,
    "canChangeRobots": false
  },

  "credentials": {
    "wordpress": {
      "username": "seo-bot",                 // usuario WP con rol Editor/Admin
      "applicationPassword": "abcd EFGH 1234 wxyz 5678 ZZZZ"
    },
    "seranking": {                            // opcional si configuras SERANKING_API_KEY global
      "apiKey": "sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

Ver `scripts/sites.example.json` para un ejemplo.

### Cómo conseguir cada credencial

| Credencial | Dónde se obtiene |
|---|---|
| **WP Application Password** | WordPress → Usuarios → tu usuario `seo-bot` → "Application Passwords" → "Add New" → Copiar la cadena de 24 chars. Hay que activar Application Passwords si no lo está (WP 5.6+ trae built-in). |
| **SE Ranking API key** | seranking.com → My account → API → Generate API key. |
| **`serankingProjectId`** | En SE Ranking, abrir el proyecto → la URL contiene `/sites/{id}/` → ese es el id. |

### Por seguridad

- Crea un usuario WP dedicado `seo-bot` (rol Editor mínimo, Admin si quieres canChangeSlugs/canChangeCanonical).
- NO uses tu Application Password personal.
- Revoca el Application Password si rotas o si dejas el proyecto.

## 4. Cargar los sitios en la BD

Una vez tengas el `sites.json`:

```bash
cd /var/www/vhosts/avenuemedia.io/lava.avenuemedia.io/app
SECRETS_MASTER_KEY="..." DATABASE_URL="..." node scripts/seed-sites.mjs /path/to/sites.json
```

El script:
- Crea/actualiza los `Client` y `Project`.
- Cifra y guarda las credenciales.
- Configura `ProjectCapability`.

## 5. Decisiones pendientes que necesito de ti

### 5.1. Generación de contenido del artículo

Los `ContentDraft` se generan con outline + meta, pero **sin texto del artículo**.
Para producción necesitas decidir:

- **Opción A** (recomendada): conectar LLM (Claude/GPT) que rellene `contentHtml` a partir del outline + primary keyword. Yo te dejo el hook en `ExecuteService.applyCreatePostElementor` (línea con "Contenido pendiente"). Sólo me falta la API key del modelo y la decisión de tono/longitud.
- **Opción B**: SEO writers humanos editan el `ContentDraft` (campo `contentHtml`) vía un UI que tendrías que construir, antes de aprobar.
- **Opción C**: dejar el draft con outline solo; el writer/copy lo completa directamente en Elementor después.

**Decide:** A, B o C. Si A → necesito modelo (Claude Sonnet 4.6 recomendado) y guidelines de copy (longitud objetivo, tono, secciones obligatorias).

### 5.2. Cadencia de runs

- **Extract**: ¿diario, semanal, mensual? SE Ranking actualiza posiciones a diario; recomiendo **diario** para tracking real, **semanal** si tienes muchos sitios y rate-limit ajustado.
- **Strategy**: ¿semanal? Cada strategy run añade nuevas Opportunities; no las elimina (idempotente).
- Una vez decidas, programamos `scheduled-task` correspondiente.

### 5.3. Approvals

- ¿Quién aprueba? (lista de emails autorizados — necesito un `ProjectMember` table o lo dejamos como string libre por ahora).
- ¿Doble aprobación para `riskLevel: critical/high`? El campo ya existe en `ProjectCapability.requiresDoubleApprovalForHighRisk` pero no está enforced en el código todavía.

### 5.4. Elementor: nivel de fidelidad

El `ElementorAdapter` construye documentos válidos con widgets básicos
(heading, text-editor, image, accordion para FAQ, button para CTA). Para
diseños complejos (kits, columns múltiples, widgets Pro) hay dos caminos:

- **Camino corto**: definir un Saved Template en Elementor por cada tipo de
  artículo (review, listicle, FAQ, landing) y que yo duplique ese template
  + reemplace placeholders. **Necesito los IDs de esos templates**.
- **Camino largo**: extender `ElementorAdapter` para soportar todos los widgets
  que uséis (estimación: 1-2 días por widget complejo).

## 6. WordPress: prerrequisitos por sitio

Para que el sistema funcione en cada sitio WordPress:

- WP 5.6+ con Application Passwords activos (default).
- HTTPS válido (necesario para REST API moderna).
- Permalinks NO en "Plain" (REST API necesita rewrites).
- Plugins activos: RankMath Pro, Elementor (Free es suficiente para texto;
  Pro si usáis widgets exclusivos).
- En `wp-config.php`: `define('WP_DEBUG', false);` en producción para evitar HTML noise en las respuestas REST.

## 7. SE Ranking: límites a confirmar

- Tu plan SE Ranking → confirmar API calls/minuto (rate limit). El cliente está configurado a **240 req/min (Project API)** y **480 req/min (Data API)** por defecto; ajustar en `src/clients/seranking.ts` si tu plan es menor.
- Si tienes más de un workspace en SE Ranking, dime cuál y filtramos.

## 8. Resumen ejecutivo de qué falta hacer YO vs TÚ

| Tarea | Quién | Estado |
|---|---|---|
| Extender schema Prisma con modelos extract | ✅ Yo | Hecho |
| Implementar clientes SE Ranking / WP / RankMath / Elementor | ✅ Yo | Hecho |
| Implementar servicios Extract / Strategy / Execute | ✅ Yo | Hecho |
| Encriptación de credenciales | ✅ Yo | Hecho |
| Tools MCP de orquestación + approvals | ✅ Yo | Hecho |
| Script seed multi-sitio | ✅ Yo | Hecho |
| Generar `SECRETS_MASTER_KEY` y añadirla al `.env` del VPS | 🟡 Tú | Pendiente |
| Aplicar migración Prisma en BD | 🟡 Tú o yo (con tu OK) | Pendiente |
| Preparar `sites.json` con los 30-40 sitios | 🟡 Tú | Pendiente |
| Crear usuario `seo-bot` + Application Password en cada WP | 🟡 Tú | Pendiente |
| Cargar `sites.json` con el seed script | 🟡 Tú o yo | Pendiente |
| Decidir 5.1 (generación contenido) | 🟡 Tú | Pendiente |
| Decidir 5.2 (cadencia) y crear scheduled-tasks | 🟡 Tú | Pendiente |
| Definir templates Elementor (5.4 camino corto) | 🟡 Tú | Pendiente |
| Conectar LLM si elegiste opción A | 🟢 Yo (cuando me digas) | Pendiente |

## 9. Pruebas rápidas para validar cuando esté todo

Tras seed + migración + `SECRETS_MASTER_KEY`, prueba en orden:

```bash
# 1. Server arriba con código nuevo
curl https://lava.avenuemedia.io/version
curl https://lava.avenuemedia.io/

# 2. Listar proyectos cargados
curl -X POST https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "origin: https://claude.ai" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_sites","arguments":{}}}'

# 3. Ingest de un proyecto concreto
curl -X POST https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ingest_project","arguments":{"project_id":"<uuid>"}}}'

# 4. Strategy
curl -X POST https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate_strategy","arguments":{"project_id":"<uuid>"}}}'

# 5. Revisar ChangeRequests pendientes
curl -X POST https://lava.avenuemedia.io/mcp \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_change_requests","arguments":{"project_id":"<uuid>","status":"proposed","limit":20}}}'
```

O conéctalo en Claude.ai como custom connector y usa lenguaje natural:

> "Lista las oportunidades del proyecto X ordenadas por priorityScore"
>
> "Apruébame el ChangeRequest <id> y ejecútalo"
>
> "Lanza ingest_all_projects y dame un resumen"
