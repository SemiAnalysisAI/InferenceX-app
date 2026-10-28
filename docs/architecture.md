# Architecture Decisions

See [App Source Organization](./source-organization.md) for component/provider
ownership and conventions for preserving module boundaries.

## Client-First, API-Passthrough

Raw-data API routes return raw DB rows with zero transformation, validation, or filtering. All presentation logic lives in the frontend. This isn't laziness — it's intentional:

- **Caching**: Raw responses are maximally cacheable (1-day CDN cache). Any server-side filtering would multiply cache keys and reduce hit rates.
- **Flexibility**: The frontend changes far more often than the data shape. Keeping transformation client-side means API routes never need updating for new chart metrics, filter logic, or display formats.
- **Simplicity**: No DTOs, no mappers, no validation gatekeeping. The DB schema IS the API contract.

### Deliberate API Exceptions

Some routes serve a purpose that raw DB rows cannot satisfy:

- Dashboard projections under `/api/v1/views/*` use shared pure UI transformations server-side and publish their selectors and assumptions. Keep raw-data contracts separate from these projections.
- CollectiveX assembles its stored committed-result documents through its shared reader.
- OperatorX uses versioned ingest-time comparison projections for its page-owned API. The reader merges compact timing rows across runs while preserving source revisions, statuses, and timeline references; raw documents remain available for drilldowns. An optional revision-keyed Blob cache shares the merged comparison across instances; partial reads are excluded and OperatorX invalidation purges its deployment subtree. See [OperatorX](./operatorx.md#compact-comparison-reads).
- `tco-feed` performs server-side frontier interpolation for spreadsheet consumers that cannot run the TypeScript transforms. Its assumptions (tier weights, workload mix, α) enter only as explicit query params with documented defaults, so a published sheet's URL fully records its methodology.
- `pareto` returns frontier and hinterland coordinates over stored benchmark rows with explicit axis preferences. It reuses the chart dominance algorithm without UI filters. See the [Pareto frontier and hinterland reference](../packages/skills/skills/inferencex-api/references/pareto.md).
- `gpu-metrics-point` is a point-detail BFF. It computes per-GPU statistics from stored samples on a cache miss and caches the payload by telemetry revision.
- `server-log-search` searches immutable log bundles in bounded database slices and returns only contextual matches. Returning raw rows would require transferring complete files that can exceed 100 MB before the browser could search them.
- `/api/v1/overview` is a page-owned backend-for-frontend (BFF). It returns the compact `OverviewPageData` shape used by the initial server render, allowing selector changes to update the matrix without downloading every model's raw benchmark history or triggering a React Server Component (RSC) round trip. It is not a reusable public data API.
- `/api/v1/benchmarks?view=calculator&sequence=...` is a page-owned compact view. It returns only the selected calculator scenario and the metric keys needed for interpolation, while the default endpoint preserves the raw-row contract. This reduces transfer and browser parsing without narrowing the reusable inference response.

Two rules keep the overview BFF honest, both enforced in `overview-navigation.tsx`:

- **One cache key per data state.** Requests and the in-memory cache are keyed on a canonical href rebuilt from the resolved params (`overviewDataKey`), not the address bar. Explicit defaults, reordered params and campaign tags collapse to one key, so the CDN's day-long `s-maxage` is not fragmented by link variants.
- **`ref` never reaches that key.** The reference hardware only chooses which column the percentages are measured against, and every cost that needs is already in the payload, so the client derives it from the URL and recomputes the ratio per row. The server still resolves `ref` for SSR, shared links and no-JS.

Because the selector commit uses `History.prototype.pushState` rather than Next's patched version, `useSearchParams()` and `usePathname()` stay at the load-time URL on `/overview`. Anything that needs the live URL there listens for `CLIENT_SEARCH_CHANGE_EVENT`; the provider emits its own `$pageview`. Do not add a `useSearchParams()` consumer to the overview tree.

## URL State Persistence

Chart filter state (model, sequence, metric, precisions, date range, GPU selections) is serialized to URL query params. This enables shareable links that reproduce exact chart views.

The two profit estimators use model slugs followed by named route pairs instead,
including on `/zh`: `/profit-estimator/deepseek-v4/target/24`.
Their existing query-key state store is adapted at the routing boundary by
`profit-estimator-routes.ts`. Shallow history replacements keep the address bar
current; these client-owned writes bypass Next navigation rehydration so it
cannot overwrite a pending control edit. Legacy query links remain readable.
Profit dashboards use P90 only and strip legacy percentile parameters.
Language links retain route state without copying it into the query string;
the unofficial-run filter reader and cross-tab overlay links use a separate
route-aware adapter. Tab links encode run IDs in the destination's format:
route segments for profit estimators, query parameters for other dashboards.
Other dashboards keep their existing query-state behavior.

**Why debounced writes (150ms)?** Rapid filter changes (e.g., clicking multiple precision checkboxes) are batched into one flush of the in-memory share state and, on profit-estimator routes, one shallow `replaceState` of the pathname instead of one history write per click.

**Why snapshot-and-clear on load?** Initial params are read into the URL-state snapshot, then stripped from the visible address bar with `history.replaceState` while preserving the pathname and hash. Route-owned entry points can also pass typed server seeds. Subsequent debounced writes update the in-memory share state.

**Prefix convention**: `g_` (global), `i_` (inference), `e_` (evaluation), `r_` (reliability), and `c_` (calculator). The canonical dashboard route registry declares which scopes belong in each share URL.

## Server-Side Caching

`cachedDerivedData()` is the tagged, `unstable_cache`-only wrapper for compact server payloads. Compare caches one pair-filtered, full-shape hydration row set per model/GPU pair, then recomputes the inexpensive sequence/precision table transform per request; nesting a selector cache around the pair cache would bypass Next.js incremental caching.

## React Query Configuration

- **staleTime Infinity / gcTime Infinity**: Data changes only when CI ingests new results. Infinite TTLs mean React Query never refetches or garbage-collects on its own — data is fetched once per page load and held for the session. The server-side CDN cache ensures fast responses.
- **refetchOnWindowFocus: false**: Users tab away to reference articles, then come back. Auto-refetching would cause jarring chart rebuilds and lose zoom state.
- **Placeholder data** (opt-in per hook, e.g. `useBenchmarks` with `keepPreviousForModel`): when the date or run changes within one model, the old chart stays visible during the fetch. Another model's rows are never used as a placeholder. Without this, users see a loading skeleton for 200-500ms on every such change.
- **retry: 1**: Single retry catches transient network blips. More retries would delay error display for actual outages.
