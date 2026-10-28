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

Because the selector commit uses `History.prototype.pushState` rather than Next's patched version, `useSearchParams()` and `usePathname()` stay at the load-time URL on `/overview`. Anything that needs the live URL there listens for `CLIENT_SEARCH_CHANGE_EVENT`. The provider calls `trackVirtualPageview`, which records a `$pageview` only when the pathname changes, so control changes are not pageviews. Do not add a `useSearchParams()` consumer to the overview tree.

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

## Analytics

PostHog loads after `window.load` plus an idle callback to keep it off the critical path. If the page is hidden (`visibilitychange` to hidden or `pagehide`) while events are still queued, it starts loading immediately instead, so a visitor who switches tabs or leaves before the idle callback still sends the pageview. It posts through the first-party `/ingest` rewrites in `next.config.ts`, with dead-click capture off and autocapture on. Network timing in recordings drops `search`, `q` and `query` URL params (`lib/analytics/network-request-mask.ts`) so typed search text is never captured.

Until the client loads, `track()` in `lib/analytics/analytics.ts` queues events (capped at `MAX_PENDING_EVENTS`, later events are dropped). Each queued event keeps the URL and time at which it was tracked and is replayed with PostHog's `timestamp` option. The first tracked event of a page load records that page's `$pageview` ahead of it, so page effects such as `landing_page_viewed` never precede the pageview.

Pageviews are manual. `PageViewTracker` records one per Next pathname or search change, deduplicated by URL. Model switches rewrite the pathname outside the Next router, so it also records a virtual `$pageview` (`navigation_type: 'client_pathname_change'`) on `CLIENT_PATHNAME_CHANGE_EVENT`, but only when the event detail has `pageview: true` (pass `{ pageview: true }` to `replaceClientPathname`/`replaceRouterPathname`). Filter-driven path rewrites (profit estimator) and query-only rewrites (filters, `/overview` controls) are not pageviews.

`inference_chart_rendered` fires once per navigation when the first chart has data points. `ms_since_navigation` counts from the latest navigation start (`lib/analytics/navigation-timing.ts`: document load, or the pathname change for soft navigations) and `soft_navigation` tells the two apart. Every pageview carries and registers `route_template` (for example `/inference/[model]`, shared by `/zh`) and `locale`, so pageviews and web vitals group by template. Add new dynamic routes to `lib/analytics/route-template.ts`.

A delegated click listener sends `outbound_link_clicked` (`host`, `path`, `is_newsletter`, `is_semianalysis`) for links to other hosts. 404 pages send `not_found_page_shown`. Search events send `query_length` and result counts, never the typed text.

## Server-Side Caching

`cachedDerivedData()` is the tagged, `unstable_cache`-only wrapper for compact server payloads. Compare caches one pair-filtered, full-shape hydration row set per model/GPU pair, then recomputes the inexpensive sequence/precision table transform per request; nesting a selector cache around the pair cache would bypass Next.js incremental caching.

### ISR pages and initial data

Compare (`/compare`, `/compare-per-dollar`, `/compare-precision`, `/compare-spec-decode`, their `[scenario]` children and `/zh` mirrors), `/run` and `/rankings` detail pages set `revalidate = 3600` and return `[]` from `generateStaticParams()`. Nothing is prerendered at build time. Each URL renders on its first request and is then served from the ISR cache for up to an hour, or until an ingest expires the `db` tag.

Compare pages embed only the rows for the page's default sequence (`initialCompareBenchmarkRows()`), not the whole pair history. `InferenceContext` passes those rows through `resolveBenchmarkSeed()` (`components/inference/utils/benchmark-seed.ts`), which uses them only while the selection matches the seeded model and sequence, under a sequence-scoped query key. Picking another sequence falls through to the shared full-model benchmarks query, so a partial seed never answers for data it lacks.

The overview page (`/overview`, `/zh/overview`) is prerendered with the default controls and ignores `searchParams` on the server. When a shared URL asks for other controls, `OverviewNavigationProvider` loads that state from `/api/v1/overview` after mount.

### API responses

`cachedJson()` (`lib/cache/api-cache.ts`) takes the incoming request. It serves brotli, then gzip, then plain JSON according to `Accept-Encoding`, so a client that sends no header (curl, scripts) gets plain JSON. Every response carries `Vary: Accept-Encoding` and a strong `ETag` hashed from the payload and the chosen encoding. A matching `If-None-Match` returns a bodiless `304`. Route handlers that call other handlers directly use `sourceRequest()`, which sends no `Accept-Encoding`, so they always read plain JSON.

`Cache-Control` is `public, max-age=60, s-maxage=86400, stale-while-revalidate=86400`. Vercel strips `s-maxage` and `stale-while-revalidate` before the browser, so a browser reuses a response for 60 s and then revalidates it with its ETag, which costs a round trip but no body. Browsers get no stale-while-revalidate window, which keeps a returning visitor from seeing pre-ingest data for longer than a minute.

Fixture builds (`E2E_FIXTURES=1`) send `Cache-Control: no-store` instead, so every E2E request reaches the network where `cy.intercept` stubs it.

Server data (`unstable_cache` plus Blob) and CDN responses (the `db-cdn` tag) are tagged separately. `cachedQuery` keeps two `unstable_cache` entries per query. Route handlers read the `db`-tagged one, and ISR renders (sitemap included) read a separately keyed `db-page` one. On ingest, `purgeAll()` deletes the blobs, expires `db` immediately, and only marks `db-page` and `db-cdn` stale (`revalidateTag(tag, 'max')`). The next visitor gets the previous response at once while the CDN refetches in the background, and that refetch reads the database because the route entries are already gone. Expiring route data with `'max'` instead would hand the stale entry to the CDN's refetch and cache it for another day. ISR pages keep serving their previous HTML, because a stale `unstable_cache` entry is refetched in the foreground during regeneration, and the stale value is kept if that refetch fails. Corrections and retractions (`apply-run-overrides.yml`, `cache-refresh.yml`) run `admin:cache:invalidate <origin> --immediate`, which posts `/api/v1/invalidate?immediate=true` and expires every tag outright so retracted data is never served again. CollectiveX and OperatorX have no server data layer, so their tags are marked stale too, and their scoped purges (`?scope=collectivex` or `?scope=operatorx`) also honor `immediate=true`. Deleting a CollectiveX run purges immediately, because the admin who deleted it reloads right away.

The ingest workflow then runs `bun run admin:cache:warmup <origin> --dashboard`, and production promotions run the same warmup in `warm-after-deploy.yml`. The script requests the dashboard APIs with a browser `Accept-Encoding` and reads every body, because the CDN keeps one variant per encoding and only caches a streamed response that was read to the end. The post-ingest PowerX verifier sends `Pragma: no-cache`, which makes the CDN revalidate a stale entry before it answers.

## React Query Configuration

- **staleTime Infinity / gcTime Infinity**: Data changes only when CI ingests new results. Infinite TTLs mean React Query never refetches or garbage-collects on its own — data is fetched once per page load and held for the session. The server-side CDN cache ensures fast responses. Keys use canonical values (sorted, deduplicated ids, `''` for the latest date), so equivalent requests share one cache entry.
- **No waterfall to the first chart**: the latest benchmarks request depends only on the model, so the inference chart starts it in parallel with `/api/v1/availability` through a second observer on the same query key (`prefetchLatestRows` in `useChartData`). The gated query, which waits for the resolved sequence, then reads that entry, and the chart never renders the default sequence first. `workflow-info` still waits for the resolved run date.
- **Bulk id lookups** (`useBulkIdsQuery`): requests are split at each route's id limit, and ids that a fresh lookup for the same endpoint already covered are not requested again. A chart whose visible points change as filters settle therefore fetches only the new ids. Freshness is tracked per id from its original fetch, so reused ids never outlive the 5-minute stale time.
- **refetchOnWindowFocus: false**: Users tab away to reference articles, then come back. Auto-refetching would cause jarring chart rebuilds and lose zoom state.
- **Placeholder data** (opt-in per hook, e.g. `useBenchmarks` with `keepPreviousForModel`): when the date or run changes within one model, the old chart stays visible during the fetch. Another model's rows are never used as a placeholder, and neither are rows from a differently scoped key (a one-sequence compare seed), which would render an empty chart. Without this, users see a loading skeleton for 200-500ms on every such change.
- **retry: 1**: Single retry catches transient network blips. More retries would delay error display for actual outages.
