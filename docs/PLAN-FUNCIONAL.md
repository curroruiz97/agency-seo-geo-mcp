# Plan funcional: MCP Avenue → sistema SEO automatizado

Este documento describe la arquitectura y el flujo completo del MCP cuando deja
de ser un esqueleto y se convierte en un sistema funcional que opera sobre los
~30-40 sitios WordPress de la agencia.

## Visión general

```
SE Ranking ──┐                              ┌── WordPress REST
             ├──► Extract ──► Strategy ──► Execute ──► RankMath Pro
GSC / GA  ───┘     │           │             │       └── Elementor
                   ▼           ▼             ▼
              ExtractionRun  Opportunity  ChangeRequest
              Keyword        ContentDraft  ActionLog
              KeywordSnapshot
              AuditFinding
              Competitor
              ContentGap
```

Tres servicios encadenados, todos con la misma BD (Supabase Postgres) como
única fuente de verdad. Cada paso es **idempotente** y deja trazabilidad en la
BD para auditoría.

## Capas

### 1. Clientes externos (`src/clients/`)

| Archivo | Qué hace |
|---|---|
| `http.ts` | Cliente HTTP base con rate limit (token bucket), retry exponencial en 429/5xx, timeout. |
| `seranking.ts` | SE Ranking API v1. Listado de proyectos, keywords, posiciones, audit issues, competitors, backlinks. |
| `wordpress.ts` | WP REST `/wp-json/wp/v2`. Auth via Application Password. CRUD posts, pages, media, categorías, tags. |
| `rankmath.ts` | RankMath Pro: meta de post (title, description, focus keyword, schema) y `/rank-math/v1/redirections`. |
| `elementor.ts` | Adapter que construye `_elementor_data` desde un modelo de bloques (heading, paragraph, list, image, FAQ, CTA). |

Todos los clientes son **per-sitio** y se instancian on-demand con
credenciales descifradas (no se cachea el plaintext).

### 2. Servicios (`src/services/`)

#### `credentials.ts` — CredentialsService

Persiste credenciales **cifradas** (AES-256-GCM, clave maestra
`SECRETS_MASTER_KEY` derivada con scrypt). Una fila `ProjectCredential` por
(proyecto, tipo, label). Hay un proyecto sentinel `__global__` para claves de
cuenta (p.ej. la API key de SE Ranking que es account-wide).

#### `extract.ts` — ExtractService

`runForProject(projectId)`:
1. Lee `serankingProjectId` y la API key (per-project o global).
2. Crea un `ExtractionRun` (status: running).
3. Llama a SE Ranking:
   - `listKeywords` → upsert en `Keyword` (catalog).
   - `getCurrentPositions` → inserta `KeywordSnapshot` (snapshot histórico).
   - `getAuditIssues` → upsert en `AuditFinding` (por `(projectId, ruleCode, url)`).
   - `getCompetitors` → upsert en `Competitor`.
4. Marca el `ExtractionRun` como completed con stats; o failed con errorMessage.

`runForAllActiveProjects()`: barre todos los proyectos activos en serie
(respetando rate limit de SE Ranking).

#### `strategy.ts` — StrategyService

`generateForProject(projectId)` aplica heurísticas determinísticas (sin LLM):

- **Keyword opportunities** (positions 5-20): score = `log10(1+volume) * (21-pos)/16 * intentMult`. Genera `Opportunity` y, si hay landing URL, un `ChangeRequest` de tipo `rankmath_optimise_existing_post`.
- **Audit findings**: por cada finding sin resolver crea una `Opportunity` con score basado en severidad; si la regla mapea a un `changeType` conocido (title, description, canonical, robots, redirect) crea un `ChangeRequest`.
- **Content gaps**: por cada gap con `ourPosition: null` crea un `ContentDraft` (outline básico) y un `ChangeRequest` de tipo `wordpress_create_post_with_elementor`.

Salida: `{opportunitiesCreated, changeRequestsCreated, contentDraftsCreated}`.

#### `execute.ts` — ExecuteService

`applyApprovedRequest(changeRequestId)`:
1. Carga la `ChangeRequest`. Si no está en estado `approved` → error.
2. Switch por `changeType`:
   - `rankmath_optimise_existing_post` / `rankmath_update_metadata` → `RankMathClient.updatePostMeta` (guarda before/after y rollbackPayload).
   - `wordpress_create_post_with_elementor` → `ElementorAdapter.createPostWithElementor` desde `ContentDraft`.
   - `wordpress_create_post` / `wordpress_update_post` / `wordpress_update_page` → `WordPressClient`.
   - `rankmath_create_redirection` → `RankMathClient.createRedirection`.
3. Marca `applied` y registra `ActionLog`. En error → `failed` y registro.

### 3. Tools MCP

#### Orquestación (`src/mcp-tools/orchestration.tools.ts`)

| Tool | Descripción |
|---|---|
| `ingest_project` | Extract para un proyecto. |
| `ingest_all_projects` | Extract para todos los activos. |
| `generate_strategy` | Strategy para un proyecto. |
| `generate_strategy_all_projects` | Strategy para todos. |
| `run_pipeline_for_project` | Extract + Strategy en un proyecto. |
| `run_pipeline_all_projects` | Extract + Strategy en todos (cron diario/semanal). |

#### Aprobaciones y ejecución (`src/mcp-tools/changeRequests.tools.ts`)

| Tool | Descripción |
|---|---|
| `list_change_requests` | Backlog filtrable por proyecto/status/changeType/risk. |
| `list_opportunities` | Lista priorizada de oportunidades. |
| `list_extraction_runs` | Historial de runs de extracción. |
| `approve_change_request` | proposed → approved. |
| `reject_change_request` | proposed → rejected. |
| `execute_change_request` | approved → applied (llama a ExecuteService). |

## Flujo end-to-end

```
1.  Operador (humano o cron):  ingest_all_projects
    → ExtractService barre los 30-40 sitios → BD poblada con datos frescos.

2.  Operador:  generate_strategy_all_projects
    → StrategyService genera Opportunities + ChangeRequests pendientes.

3.  Operador:  list_change_requests (status=proposed, project_id=...)
    → revisa qué se va a aplicar.

4.  Operador:  approve_change_request (con approved_by=email)
    → status proposed → approved.

5.  Operador:  execute_change_request
    → ExecuteService aplica el cambio vía WP/RankMath/Elementor.
    → Status approved → applied, rollbackPayload guardado.
```

Para automatizar pasos 1-3: programar `run_pipeline_all_projects` como
scheduled-task (semanal recomendado, diario para cuentas grandes).

## Multi-tenancy

- Cada `Project` tiene su `wordpressUrl`, `serankingProjectId`, `permissionLevel` (read_only | proposal_only | approved_writes) y `ProjectCapability` (flags granulares para Publicar, Cambiar slugs, etc.).
- Credenciales por sitio en `ProjectCredential` cifradas con `SECRETS_MASTER_KEY`.
- Para credenciales account-wide (la API key de SE Ranking suele serlo), se usa un proyecto sentinel con `domain="__global__"`.

## Seguridad y aprobaciones

- `READ_ONLY_MODE=true` (env) impide cualquier ejecución incluso si una ChangeRequest está `approved`. Se mantiene activo hasta que la operación esté validada.
- Toda ChangeRequest pasa por `proposed → approved → applied`. No hay short-circuit.
- `rollbackPayload` se guarda en `before` para rollback si hace falta.
- `ActionLog` registra input/output de cada ejecución.

## Datos que entran y salen

### Entran (extract)

- SE Ranking: keywords, posiciones (con histórico vía snapshots), site audit, competitors, backlinks.
- Espacio para GSC/GA (stubs ya registrados, integración pendiente).

### Salen (execute)

- WordPress: posts, pages, media, slugs, status.
- RankMath: meta title, meta description, focus keyword, schema, redirecciones.
- Elementor: documentos `_elementor_data` con bloques heading/paragraph/list/image/faq/cta.

## No incluido en esta iteración (siguiente fase)

- **Generación de contenido completo del artículo con LLM**. El `ContentDraft` se crea con outline + meta sugeridos pero sin texto largo. Para producción real se conecta a un LLM (Claude / GPT) que rellene el `contentHtml` y los `internalLinks` antes de marcarlo como `ready`.
- **Google Search Console / Google Analytics**: tools registradas pero stubs; los clientes y servicios siguen el mismo patrón que SE Ranking.
- **Plugin WordPress propio para Elementor** (recomendado para 100% de fidelidad en widgets Pro). Hoy el adapter cubre ~80% de necesidades SEO sin necesidad de plugin.
- **OAuth/SSO multi-usuario**. Hoy todo va con bearer token.
