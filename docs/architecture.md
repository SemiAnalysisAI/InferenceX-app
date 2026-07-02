# Architecture Decisions

## Client-First, API-Passthrough

API routes return raw DB rows with zero transformation, validation, or filtering. All presentation logic lives in the frontend. This isn't laziness — it's intentional:

- **Caching**: Raw responses are maximally cacheable (1-day CDN + 1hr stale-while-revalidate). Any server-side filtering would multiply cache keys and reduce hit rates.
- **Flexibility**: The frontend changes far more often than the data shape. Keeping transformation client-side means API routes never need updating for new chart metrics, filter logic, or display formats.
- **Simplicity**: No DTOs, no mappers, no validation gatekeeping. The DB schema IS the API contract.

## Filesystem Tab Routing (App Router)

Each tab is a Next.js App Router page under `packages/app/src/app/(dashboard)/`. The route group `(dashboard)` has a single `layout.tsx` that renders `DashboardShell` — which mounts `UnofficialRunProvider`, `TabNav`, and `GlobalFilterProvider` once for all tabs.

```
app/(dashboard)/layout.tsx         ← DashboardShell (shared shell for every tab)
app/(dashboard)/inference/page.tsx ← mounts InferenceProvider
app/(dashboard)/evaluation/page.tsx
app/(dashboard)/historical/page.tsx ← also mounts InferenceProvider (activeTab="historical")
app/(dashboard)/calculator/page.tsx
app/(dashboard)/reliability/page.tsx ← mounts ReliabilityProvider
...
```

Tab metadata (title, description, canonical URL) is centralized in `packages/app/src/lib/tab-meta.ts` via `VALID_TABS`, `TAB_META`, and the `tabMetadata()` helper used as the `export const metadata` in each page.

**Why a route group, not hash?** Hash changes do not trigger Next.js navigation, so providers stay mounted. But the refactored approach uses filesystem routes with layout-level providers to retain the same benefit: `UnofficialRunProvider` and `GlobalFilterProvider` mount once in `DashboardShell` and survive tab navigation (Next.js re-uses the layout shell without remounting it). Per-tab providers (`InferenceProvider`, `EvaluationProvider`, etc.) mount and unmount with their page, but they are lightweight: their state is initialised from URL params on mount, so navigating back to a tab restores state from the share URL rather than keeping stale in-memory state across tabs.

**`inferencex:tab-change` custom event**: `TabNav` dispatches `window.dispatchEvent(new CustomEvent('inferencex:tab-change'))` on every tab click. Charts listen for this to cancel in-flight animations and reset zoom refs before the new route's component tree mounts.

**Gated tabs**: Six tabs (`inference`, `evaluation`, `historical`, `calculator`, `gpu-specs`, `submissions`) are visible in the nav bar to all users. Four tabs (`ai-chart`, `gpu-metrics`, `current-inferencex-image`, `feedback`) are hidden behind a feature gate (`useFeatureGate()`) and accessible via a "Hidden" popover dropdown in the desktop nav.

## URL State Persistence

Chart filter state (model, sequence, metric, precisions, date range, GPU selections) is serialized to URL query params. This enables shareable links that reproduce exact chart views.

**Why debounced writes (150ms)?** Rapid filter changes (e.g., clicking multiple precision checkboxes) would spam `history.pushState`. Debouncing batches them into a single URL update.

**Why snapshot-and-clear on load?** Initial params are read into React state, then stripped from the URL via `history.replaceState`. This prevents stale params from accumulating across navigation — the URL always reflects current state, written back by the debounced sync.

**Prefix convention**: `g_` (global), `i_` (inference), `e_` (evaluation), `r_` (reliability). Prevents namespace collisions and allows `buildShareUrl()` to include only tab-relevant params.

## Provider Nesting Order

Providers are split across two mount points — the root layout and the shared dashboard layout shell — with per-tab providers mounting in each tab's own page:

```
Root layout:      PostHogProvider → QueryProvider → ThemeProvider
Dashboard shell:  UnofficialRunProvider → GlobalFilterProvider
Per-tab page:     InferenceProvider | EvaluationProvider | ReliabilityProvider | (none)
```

This isn't arbitrary. Each provider depends on the one above it:

- `QueryProvider` must wrap everything that calls React Query hooks
- `ThemeProvider` wraps the whole tree so theme tokens are available everywhere
- `GlobalFilterProvider` needs React Query (`useAvailability()`, `useWorkflowInfo()`) and lives in the dashboard shell so it survives tab navigation
- `InferenceProvider` needs global model/date selection from `GlobalFilterProvider`; the `activeTab` prop gates heavy memoization work to avoid it running on the historical tab
- `EvaluationProvider` and `ReliabilityProvider` are independent per-tab providers; Reliability does not consume `GlobalFilterProvider` at all
- TCO Calculator and Historical Trends: calculator uses local `useState`; historical mounts `InferenceProvider` directly (shared state is sufficient since no additional cross-tab sharing is needed)

## Client-Side Caching (React Query — In-Memory Only)

React Query holds all fetched data in memory with `staleTime: Infinity` and `gcTime: Infinity`. There is no persistent client-side cache — data is fetched fresh on each page load and held in memory for the duration of the session.

## Server-Side Caching (API Routes)

API route responses are cached at two layers before hitting the CDN.

### Two-Tier Server Cache

| Tier                   | Mechanism          | Size Limit         | When Used                                          |
| ---------------------- | ------------------ | ------------------ | -------------------------------------------------- |
| Local (unstable_cache) | Next.js in-process | ~2 MB default      | Small payloads (availability, workflow-info, etc.) |
| Blob storage           | Vercel Blob        | No practical limit | Large payloads that exceed the 2 MB threshold      |

`cachedQuery()` in `src/lib/api-cache.ts` wraps both tiers. Pass `{ blobOnly: true }` for payloads known to be large (e.g. `/api/v1/benchmarks`, which returns full benchmark rows for a model). The blob path is `{BLOB_CACHE_PREFIX}/{keyPrefix}:{args}.json`.

`blobSet()` is no-op if the key already exists, making concurrent lambda invocations race-safe — only the first writer wins, subsequent calls skip silently.

### Tag-Based Invalidation

`unstable_cache` entries are tagged `'db'`. Calling `revalidateTag('db', { expire: 0 })` evicts all local cache entries in one call. Blob storage has no built-in tag system, so `blobPurge()` walks the paginated blob list and deletes every object under the prefix.

Both are called together by `purgeAll()`, which also writes a new `cache-version` timestamp to blob storage.

### CDN Cache Headers

`cachedJson()` sets:

```
Cache-Control: public, max-age=0, s-maxage=31536000
Vercel-Cache-Tag: db
```

`s-maxage=31536000` (1 year) keeps responses on the Vercel CDN essentially forever. `Vercel-Cache-Tag: db` allows the CDN layer to be purged by tag when `revalidateTag` fires, so stale CDN entries are evicted immediately on invalidation rather than waiting for TTL expiry. Responses stream in 64 KB chunks to stay within Vercel's 20 MB CDN response limit.

### /api/v1/invalidate

`POST /api/v1/invalidate` requires a `Bearer {INVALIDATE_SECRET}` header (compared with `timingSafeEqual` to prevent timing attacks). On success it calls `purgeAll()` — which clears blob storage, bumps the cache-version timestamp, and revalidates the `'db'` tag — then returns `{ invalidated: true, blobsDeleted: N }`. This endpoint is called by the CI ingest pipeline after each benchmark run completes.

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
