# Architecture Decisions

## Client-First, API-Passthrough

API routes return raw DB rows with zero transformation, validation, or filtering. All presentation logic lives in the frontend. This isn't laziness — it's intentional:

- **Caching**: Raw responses are maximally cacheable (1-day CDN + 1hr stale-while-revalidate). Any server-side filtering would multiply cache keys and reduce hit rates.
- **Flexibility**: The frontend changes far more often than the data shape. Keeping transformation client-side means API routes never need updating for new chart metrics, filter logic, or display formats.
- **Simplicity**: No DTOs, no mappers, no validation gatekeeping. The DB schema IS the API contract.

## Hash-Based Tab Routing (Not Next.js Routes)

Tabs use `window.location.hash` instead of Next.js file-based routing because:

- The entire app is a single dashboard page. Separate routes would mean separate page loads, losing React state (zoom positions, filter selections, legend toggles).
- Hash changes don't trigger Next.js navigation, so context providers stay mounted. This is critical — rebuilding D3 charts from scratch on tab switch would cause visible jank.
- Browser back/forward still works (hashchange event listener updates tab state).

## URL State Persistence

Chart filter state (model, sequence, metric, precisions, date range, GPU selections) is serialized to URL query params. This enables shareable links that reproduce exact chart views.

**Why debounced writes (150ms)?** Rapid filter changes (e.g., clicking multiple precision checkboxes) would spam `history.pushState`. Debouncing batches them into a single URL update.

**Why snapshot-and-clear on load?** Initial params are read into React state, then stripped from the URL via `history.replaceState`. This prevents stale params from accumulating across navigation — the URL always reflects current state, written back by the debounced sync.

**Prefix convention**: `g_` (global), `i_` (inference), `e_` (evaluation), `r_` (reliability). Prevents namespace collisions and allows `buildShareUrl()` to include only tab-relevant params.

## Provider Nesting Order

```
QueryProvider → ThemeProvider → UnofficialRunProvider → GlobalStateProvider
  → GlobalFilterProvider → InferenceProvider → EvaluationProvider → ReliabilityProvider
```

This isn't arbitrary. Each provider depends on the one above it:

- `GlobalFilterProvider` needs React Query (`useAvailability()`, `useWorkflowInfo()`)
- `InferenceProvider` needs global model/date selection; gated by `activeTab` to skip heavy work on non-inference tabs
- Evaluation and Reliability need the hardware config from Inference context
- TCO Calculator and Historical Trends reuse InferenceContext state (sequence, precisions) without their own providers — local `useState` is sufficient since they don't share state with other tabs

## Two-Tier Caching (Memory + IndexedDB) with Version Heartbeat

| Tier      | Scope          | TTL        | Rationale                                                                              |
| --------- | -------------- | ---------- | -------------------------------------------------------------------------------------- |
| In-memory | All query data | `Infinity` | Never expires on its own — invalidated explicitly by cache-version change on next load |
| IndexedDB | All query data | `Infinity` | Persists across page reloads; cleared when cache version changes                       |

Invalidation is **version-based, not time-based**. A 5-minute heartbeat polls `/api/v1/cache-version`. When the version changes (i.e., new data was ingested), IndexedDB is cleared so the next page load fetches fresh data. In-memory queries are intentionally _not_ invalidated mid-session to avoid jarring chart rebuilds — users get fresh data on their next visit.

Both tiers are best-effort — failures return null, never throw. This prevents IndexedDB quota errors or private browsing restrictions from breaking the app.

## React Query Configuration

- **staleTime Infinity / gcTime Infinity**: Data changes at most a few times per day (cron-triggered rebuilds). Infinite TTLs mean React Query never refetches or garbage-collects on its own — all invalidation is driven by the cache-version heartbeat.
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
