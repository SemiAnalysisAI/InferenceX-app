# Agentic Workload Explorer

**English** | [中文](agentic-workload-explorer_zh.md)

The Agentic Workload Explorer (`/agentic-workload-explorer`, `/zh/agentic-workload-explorer`)
is a feature-gated dashboard in **Hidden** (↑↑↓↓ unlock). It is a port of the standalone
[ProxyTrace-ReadOnly](https://github.com/SemiAnalysisAI/ProxyTrace-ReadOnly) dashboard. It
shows a frozen, anonymized snapshot of real coding-agent traffic captured by ProxyTrace:
sessions, token flow, prefix-cache reuse, latency, tool use, errors and cost. AgentX
benchmark workloads are derived from this kind of traffic; the explorer shows the
observed traffic itself.

## Data source

The explorer reads its own Neon **read replica** through `DATABASE_PROXYTRACE_READONLY_URL`.
It never writes: there is no ingest, cron, login or admin surface. Every query is scoped to
anonymized rows (`privacy_mode = 'anon'`; `ANON_ONLY_VISIBILITY` in
`packages/app/src/lib/agentic-workload-explorer/api.ts`). Only models named in
`packages/db/src/proxytrace/shared/pricing.ts` are shown; other models are labelled `other`, and
`?model=` rejects unlisted names with a 400.

The snapshot ends at `AS_OF_ISO` (`packages/db/src/proxytrace/shared/as-of.ts`). Every
clock-relative query and label uses that instant instead of the wall clock: SQL uses `NOW` /
`TODAY_UTC_DATE` / `TODAY_UTC_START` from `packages/db/src/proxytrace/as-of.ts`, and the UI uses
`packages/app/src/lib/agentic-workload-explorer/snapshot.ts`. "Final 24h", "Sep 26" and "Sep 25"
replace "last 24h", "today" and "yesterday".

Besides the copied production tables, the replica needs the `session_summary` and
`daily_client_usage` materialized views, the `session_hash_stats` table, and pre-built
`stats_cache` / `tool_analytics_cache` rows. The ProxyTrace-ReadOnly README documents their DDL,
the scrub script, and the rebuild steps. Cache writes are no-ops here: a cache miss is computed
inline and is not stored. The Tools page shows "warming" until `tool_analytics_cache` is rebuilt.

When the snapshot is reloaded: rebuild the derived tables and caches on the replica's primary,
update `AS_OF_ISO` / `SNAPSHOT_START_ISO`, and redeploy. Successful responses carry a one-day CDN
`s-maxage`, so a redeploy starts with an empty CDN cache.

## Code layout

| Concern                       | Location                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Queries (Kysely), types       | `packages/db/src/proxytrace/`                                                     |
| Pricing, classifiers, as-of   | `packages/db/src/proxytrace/shared/` (also imported by client code)               |
| API routes (`page-bff`)       | `packages/app/src/app/api/v1/agentic-workload-explorer/`                          |
| Pages (EN / ZH)               | `packages/app/src/app/(dashboard)/agentic-workload-explorer/`, `zh/(dashboard)/…` |
| Views and charts              | `packages/app/src/components/agentic-workload-explorer/`                          |
| Hooks, helpers, page metadata | `packages/app/src/{hooks,lib}/agentic-workload-explorer/`                         |

The queries use Kysely, unlike the rest of `packages/db`, because the ported query layer is
written against it. `getDb()` uses the Neon HTTP driver for Neon hosts. `createDirectDb()` opens a
`pg` pool for full-history analytics that issue many statements per request; callers `destroy()` it.

Pages are thin server wrappers around shared client views, so English and Chinese render the same
component. User-visible strings come from component-local `STRINGS = { en, zh }` dictionaries
selected with `useLocale()`. In-explorer links go through `explorerHref()` / `useExplorerHref()`
so `/zh` pages link to `/zh` siblings. Only the explorer root is indexable and in the sitemap; session
pages are `noindex`. The explorer renders inside `DashboardShell` with standalone providers. Its own
section nav (number-key hotkeys 1–0) and the global `?version=` trace-version filter sit under the
InferenceX tab nav.

## API coverage

The `/api/v1/agentic-workload-explorer/*` routes are page-owned (`page-bff` in
`api-route-catalog.ts`). Their response shapes follow the pages, so they are not published in the
OpenAPI reference or the `inferencex-skills` read-only view API. `DASHBOARD_API_COVERAGE` records the
exclusion.
