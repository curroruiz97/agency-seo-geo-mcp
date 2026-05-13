# Agency SEO/GEO MCP Roadmap

## Vision

Build a central MCP server for an SEO/GEO agency managing WordPress sites with Elementor, Rank Math Pro and SE Ranking.

The architecture is intentionally split:

- **VPS IONOS**: runs the MCP server, Caddy and Docker.
- **Supabase Cloud**: managed Postgres for project registry, approvals, logs, opportunities and reports.
- **External systems**: WordPress, Rank Math, Elementor and SE Ranking.

This keeps the agency websites isolated from the operational database and avoids turning the VPS into both application server and database operations platform.

## Current State

`v0.1.0` exists and proves the base server works:

- Express HTTP server.
- MCP Streamable HTTP endpoint at `/mcp`.
- Public `/health`.
- Mock tools: `ping`, `list_projects`, `get_server_status`.
- Docker Compose runs locally.

No real customer data, credentials or write tools exist yet.

## Roadmap Policy

- Start with **Supabase Free** for development and a small pilot.
- Move to **Supabase Pro** before relying on production client data or approval history.
- Keep `READ_ONLY_MODE=true` until the approval engine and snapshots are implemented.
- Do not expose Supabase MCP to production data with write access.
- Use Supabase MCP only as an internal developer tool, preferably project-scoped and read-only.

## Phase 1.5: Professional Foundation

Goal: turn the scaffold into a deployable foundation before the VPS deployment.

- Modularize MCP tools by domain.
- Add an application context for shared dependencies.
- Harden HTTP security: Helmet, rate limits, request IDs, sanitized production errors.
- Add production auth guard for `/mcp`.
- Add `/ready` and `/version`.
- Add GitHub Actions CI.
- Add `.gitattributes`, `CHANGELOG.md` and architecture docs.
- Upgrade test dependencies to remove dev audit issues.
- Add Docker healthcheck and non-root runtime user.

Acceptance:

- `npm run check` passes.
- Docker build passes.
- `/health`, `/ready`, `/version` and `/mcp` work.
- Production deployment fails fast if auth is required but missing.

## Phase 2: Supabase Project Registry

Goal: replace mock project data with persistent Supabase Postgres data.

- Add Prisma.
- Add schema for clients, projects, capabilities, credentials, action logs, opportunities, change requests and reports.
- Use Supabase connection pooler for the app.
- Use direct connection only for migrations when available.
- Add seed data for 3 pilot projects.
- Keep credentials encrypted at application level before writing to DB.
- Keep `list_projects` read-only.

Acceptance:

- Prisma generates successfully.
- Migrations can be applied to Supabase.
- `list_projects` reads from DB with fallback disabled in production.
- No credentials are returned by any MCP tool.

## Phase 3: WordPress Read-Only

Goal: read WordPress content safely.

- Implement WordPress client using Application Passwords.
- Store encrypted credentials in Supabase.
- Add `wp_get_site_info`, `wp_list_pages`, `wp_list_posts`, `wp_get_content`.
- Extract headings and internal links.
- Add integration tests with mocked WordPress responses.

Acceptance:

- Reads real pilot WordPress content.
- Does not write, publish or delete anything.

## Phase 4: SE Ranking Read-Only

Goal: bring search data into the opportunity engine.

- Implement `SerankingClient` abstraction.
- Support SE Ranking MCP/API strategy behind one interface.
- Cache rankings, audit issues and competitors.
- Add quick-win detection for positions 4-15.

Acceptance:

- Pilot project returns ranking data.
- Quick wins are persisted as opportunities.

## Phase 5: Rank Math Read-Only

Goal: compare on-page metadata with rankings and content.

- Build `Agency Rank Math Bridge` WordPress plugin skeleton.
- Implement status and GET metadata endpoints first.
- Add `rankmath_get_meta` and `rankmath_get_head`.
- Validate title/meta/focus keyword quality.

Acceptance:

- Reads Rank Math metadata from pilot projects.
- Creates proposals but does not apply changes.

## Phase 6: Approvals And Controlled Writes

Goal: create a safe path from proposal to execution.

- Add change request lifecycle.
- Add snapshots before writes.
- Add approve/reject tools.
- Apply only approved low-risk Rank Math metadata changes.
- Verify after write and store result.
- Add rollback where possible.

Acceptance:

- `READ_ONLY_MODE=true` blocks writes.
- Approved low-risk Rank Math updates can be applied to staging/pilot only.

## Phase 7: GEO And Reporting

Goal: operational weekly/monthly SEO/GEO insights.

- Add GEO scoring.
- Generate answer block, FAQ and schema recommendations.
- Add weekly global report.
- Add monthly client report.

Acceptance:

- Reports are generated from real stored data.
- Recommendations distinguish proposal, pending approval, applied and verified states.

## Phase 8: Elementor Safe Analysis

Goal: analyze Elementor without touching live layout data.

- Detect Elementor pages.
- Extract headings, text blocks, CTAs and image alt status from rendered HTML.
- Create section-level proposals.

Acceptance:

- Elementor remains read-only.
- Changes are suggestions for humans, not automatic writes.
