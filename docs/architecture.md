# Architecture Decisions

## Client-First, API-Passthrough

API routes return raw DB rows with zero transformation, validation, or filtering. All presentation logic lives in the frontend. This isn't laziness — it's intentional:

- **Caching**: Raw responses are maximally cacheable (1-day CDN + 1hr stale-while-revalidate). Any server-side filtering would multiply cache keys and reduce hit rates.
- **Flexibility**: The frontend changes far more often than the data shape. Keeping transformation client-side means API routes never need updating for new chart metrics, filter logic, or display formats.
- **Simplicity**: No DTOs, no mappers, no validation gatekeeping. The DB schema IS the API contract.

### Deliberate API Exceptions

Some routes serve a purpose that raw DB rows cannot satisfy:

- CollectiveX assembles stored sweep documents through its shared reader.
- `tco-feed` performs server-side frontier interpolation for spreadsheet consumers that cannot run the TypeScript transforms.
- `server-log-search` searches immutable log bundles in bounded database slices and returns only contextual matches. Returning raw rows would require transferring complete files that can exceed 100 MB before the browser could search them.
- `/api/v1/overview` is a page-owned backend-for-frontend (BFF). It returns the compact `OverviewPageData` shape used by the initial server render, allowing selector changes to update the matrix without downloading every model's raw benchmark history or triggering a React Server Component (RSC) round trip. It is not a reusable public data API.
- `/api/v1/benchmarks?view=calculator&sequence=...` is a page-owned compact view. It returns only the selected calculator scenario and the metric keys needed for interpolation, while the default endpoint preserves the raw-row contract. This reduces transfer and browser parsing without narrowing the reusable inference response.

Two rules keep that BFF honest, both enforced in `overview-navigation.tsx`:

- **One cache key per data state.** Requests and the in-memory cache are keyed on a canonical href rebuilt from the resolved params (`overviewDataKey`), not the address bar. Explicit defaults, reordered params and campaign tags collapse to one key, so the CDN's day-long `s-maxage` is not fragmented by link variants.
- **`ref` never reaches that key.** The reference hardware only chooses which column the percentages are measured against, and every cost that needs is already in the payload, so the client derives it from the URL and recomputes the ratio per row. The server still resolves `ref` for SSR, shared links and no-JS.

Because the selector commit uses `History.prototype.pushState` rather than Next's patched version, `useSearchParams()` and `usePathname()` stay at the load-time URL on `/overview`. Anything that needs the live URL there listens for `CLIENT_SEARCH_CHANGE_EVENT`; the provider emits its own `$pageview`. Do not add a `useSearchParams()` consumer to the overview tree.

## Route-Based Dashboard Navigation

Every dashboard surface is a real Next.js route. The data-only registry in
`packages/app/src/lib/dashboard-routes.ts` owns canonical paths, navigation groups,
indexability, provider capabilities, locale mirroring, and share-parameter scopes.
`TabNav` renders links from that registry, so browser back/forward uses ordinary
navigation and a newly added route cannot silently disappear from the sitemap or
Chinese route map.

Chart state survives navigation through the URL-state contract rather than a
long-lived single-page tab tree. Each route mounts only the providers it consumes.

### Per-Model Tab Routes

`/calculator/<model>` and `/historical/<model>` (plus `/zh` siblings) give every
dashboard model an indexable URL. `packages/app/src/lib/model-routes.ts` derives
the slugs from the compare-page model registry (one slug vocabulary site-wide)
and stays a thin layer on top of `dashboard-routes.ts`, whose prefix matching
already resolves the child paths — it is not a second route registry.
`GlobalFilterProvider` seeds the model from the pathname; switching models on
the page rewrites the pathname with the pristine `History.prototype.replaceState`
(same trick as `replaceClientSearch`), so the address bar tracks the model
without an App Router navigation or remount. The bare tab paths remain the
canonical home of the default model; alias slugs 308-redirect like `/compare`.

## URL State Persistence

Chart filter state (model, sequence, metric, precisions, date range, GPU selections) is serialized to URL query params. This enables shareable links that reproduce exact chart views.

**Why debounced writes (150ms)?** Rapid filter changes (e.g., clicking multiple precision checkboxes) would spam `history.pushState`. Debouncing batches them into a single URL update.

**Why snapshot-and-clear on load?** Initial params are read into the URL-state snapshot, then stripped from the visible address bar with `history.replaceState` while preserving the pathname and hash. Route-owned entry points can also pass typed server seeds. Subsequent debounced writes update the in-memory share state.

**Prefix convention**: `g_` (global), `i_` (inference), `e_` (evaluation), `r_` (reliability), and `c_` (calculator). The canonical dashboard route registry declares which scopes belong in each share URL.

## Provider Ownership

`DashboardShell` reads provider capabilities from the route registry:

```
QueryProvider → ThemeProvider → DashboardShell
  filtered routes: UnofficialRunProvider → GlobalFilterProvider
    inference / historical: InferenceProvider
    evaluation: EvaluationProvider
  calculator: UnofficialRunProvider → route-owned seeded GlobalFilterProvider
  reliability: route-owned ReliabilityProvider
  static / internal routes: no data providers
```

This keeps availability, workflow, and unofficial-run requests off pages that do not
consume them. Compare routes sit outside `DashboardShell` and own their seeded
`GlobalFilterProvider` / `InferenceProvider` pair. Agentic point-detail routes are also
standalone because they fetch point-owned data rather than dashboard filters.

## Client-Side Caching (React Query — In-Memory Only)

React Query holds all fetched data in memory with `staleTime: Infinity` and `gcTime: Infinity`. There is no persistent client-side cache — data is fetched fresh on each page load and held in memory for the duration of the session.

## Server-Side Caching (API Routes)

API route responses are cached at two layers before hitting the CDN.

### Two-Tier Server Cache

| Tier                   | Mechanism          | Size Limit         | When Used                                          |
| ---------------------- | ------------------ | ------------------ | -------------------------------------------------- |
| Local (unstable_cache) | Next.js in-process | ~2 MB default      | Small payloads (availability, workflow-info, etc.) |
| Blob storage           | Vercel Blob        | No practical limit | Large payloads that exceed the 2 MB threshold      |

`cachedQuery()` in `src/lib/api-cache.ts` wraps both tiers. Pass `{ blobOnly: true }` for payloads known to be large (e.g. `/api/v1/benchmarks`, which returns full benchmark rows for a model). Blob keys encode canonical typed arguments as `{keyPrefix}:v2:{base64url}`; keys that would exceed the pathname limit use `{keyPrefix}:v2:sha256:{digest}` instead. `blob-cache.ts` stores that key beneath `BLOB_CACHE_PREFIX` with a `.json` suffix.

`cachedDerivedData()` is the tagged, `unstable_cache`-only wrapper for compact server payloads. Overview caches its fully assembled selector response. Compare caches one pair-filtered, full-shape hydration row set per model/GPU pair, then recomputes the inexpensive sequence/precision table transform per request; nesting a selector cache around the pair cache would bypass Next.js incremental caching. Raw public benchmark responses keep their existing Blob-backed contract.

`blobSet()` is no-op if the key already exists, making concurrent lambda invocations race-safe — only the first writer wins, subsequent calls skip silently.

### Tag-Based Invalidation

`unstable_cache` entries are tagged `'db'`. Calling `revalidateTag('db', { expire: 0 })` evicts all local cache entries in one call. Blob storage has no built-in tag system, so `blobPurge()` walks the paginated blob list and deletes every object under the prefix.

`purgeAll()` calls both mechanisms and also invalidates the separate CollectiveX tag. Blob keys are versioned and encoded deterministically so structured arguments cannot collide.

### CDN Cache Headers

`cachedJson()` sets:

```
Cache-Control: public, max-age=0, s-maxage=31536000
Vercel-Cache-Tag: db
```

`s-maxage=31536000` (1 year) keeps responses on the Vercel CDN essentially forever. `Vercel-Cache-Tag: db` allows the CDN layer to be purged by tag when `revalidateTag` fires, so stale CDN entries are evicted immediately on invalidation rather than waiting for TTL expiry. Responses stream in 64 KB chunks to stay within Vercel's 20 MB CDN response limit.

### /api/v1/invalidate

`POST /api/v1/invalidate` requires a `Bearer {INVALIDATE_SECRET}` header, checked through the shared byte-safe constant-time bearer helper. On success it calls `purgeAll()`, which clears blob storage and revalidates the database and CollectiveX tags, then returns `{ invalidated: true, blobsDeleted: N }`. This endpoint is called by the CI ingest pipelines after benchmark runs and by the run-override pipeline after it applies and verifies merged override changes.

## React Query Configuration

- **staleTime Infinity / gcTime Infinity**: Data changes at most a few times per day (cron-triggered rebuilds). Infinite TTLs mean React Query never refetches or garbage-collects on its own — data is fetched once per page load and held for the session. The server-side CDN cache ensures fast responses.
- **refetchOnWindowFocus: false**: Users tab away to reference articles, then come back. Auto-refetching would cause jarring chart rebuilds and lose zoom state.
- **keepPreviousData** (per-hook, e.g. `useBenchmarks`): On sequence/model switch, the old chart stays visible during the fetch. Without this, users see a loading skeleton for 200-500ms on every filter change.
- **retry: 1**: Single retry catches transient network blips. More retries would delay error display for actual outages.

## GPU Color System (OKLch)

Colors use `oklch(L% C H)` instead of hex/HSL because OKLch is perceptually uniform — equal lightness steps look equally different to human eyes. This matters because:

- GPU variants (e.g., H100 vLLM, H100 SGLang, H100 TRT) share a hue but vary in lightness. In HSL, lightness steps look uneven. In OKLch, the visual difference between variants is consistent.
- Color families group by vendor: NVIDIA greens/yellows (hue 130-155), AMD reds (hue 25-35). Fixed hue + chroma, varying only lightness, ensures variants are distinguishable but clearly related.

## Analytics Enforcement

Every `onClick`, `onValueChange`, `onToggle` must call `track()`. This is enforced as a blocking PR review requirement (not just a guideline) because:

- The product team makes feature decisions based on usage data. A chart metric that appears unused (because tracking was forgotten) risks being removed.
- Convention `[section]_[action]` makes analytics queries simple: `WHERE event LIKE 'calculator_%'` gives all TCO Calculator interactions.
