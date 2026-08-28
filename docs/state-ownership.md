# State Ownership

Reference for agents modifying filter behavior. Explains which context to touch for a given change, how availability cascades, and how URL params are kept in sync.

## Provider Ownership

`DashboardShell` resolves provider capabilities from
`packages/app/src/lib/dashboard-routes.ts`:

```
QueryProvider
  ThemeProvider
    DashboardShell
      inference / historical / evaluation
        UnofficialRunProvider
          GlobalFilterProvider
            route-owned InferenceProvider or EvaluationProvider
      calculator
        UnofficialRunProvider
          route-owned, URL-seeded GlobalFilterProvider
      reliability
        route-owned ReliabilityProvider
      static / internal routes
        no data providers
```

Compare routes live outside `DashboardShell` and own seeded
`GlobalFilterProvider` / `InferenceProvider` pairs. Agentic point-detail routes are
standalone. Provider changes must update the canonical route registry and its parity
tests rather than adding pathname conditionals in the shell.

---

## Provider State Map

### GlobalFilterProvider

File: `packages/app/src/components/GlobalFilterContext.tsx`

**Requested selection state** (user or URL intent):

- `selectedModel` (`g_model`)
- `selectedSequence` (`i_seq`)
- `selectedPrecisions` (`i_prec`)
- requested run date and run ID (`g_rundate`, `g_runid`)

**Effective values** (purely derived):

- `effectiveSequence` resolves the requested scenario against availability
- `effectivePrecisions` resolves requested precisions against available curves
- `effectiveRunDate` resolves the requested date or latest valid date
- `selectedRunId` resolves requested run intent against `availableRuns`

`GlobalFilterProvider` owns the state, but it does not publish one response-shaped
context value. Consumers subscribe through five independently memoized domains:

- `useGlobalFilterSelection`: requested model, sequence, and precision state plus
  their effective values and `sequenceResolved`
- `useGlobalFilterActions`: stable setters for selection, run date, and run ID
- `useGlobalFilterRun`: effective date and run ID selectors plus the manual date revision
- `useGlobalFilterAvailability`: availability options, raw rows, settled state, and errors
- `useGlobalFilterWorkflow`: the run map plus workflow loading and error state

Workflow query updates therefore do not notify selection or action consumers. Selection
updates do not notify workflow-only consumers. Components should subscribe only to the
domains they read.

Availability owns explicit settled and error states. Consumers must distinguish an
unresolved request from a settled empty result. Inference fetches are gated on
`sequenceResolved` and render `availabilityError` rather than an indefinite skeleton.

There is no response-shaped workflow adapter. `RunInfo` and `availableRuns` are the
canonical run contract.

**Why here, not InferenceProvider**: Model, sequence, and precision are cross-tab. EvaluationContext consumes `selectedModel` and `availableModels` directly. If these lived in InferenceProvider, EvaluationProvider would need an indirect coupling or duplicate state.

---

### InferenceProvider

File: `packages/app/src/components/inference/InferenceContext.tsx`

Depends on `GlobalFilterProvider` through its narrow selection, run, availability,
workflow, and action hooks.

The provider owns inference-specific effects and URL synchronization, then exposes
four independently memoized domains. Consumers must subscribe only to the domains
they read.

**`useInferenceData`**

Fetched and derived benchmark results:

- `graphs`, `hardwareConfig`, `loading`, and `error`
- `hwTypesWithData`
- GPU, date, precision, sequence, model, run, and quick-filter availability

**`useInferenceFilters`**

Workflow, filter, and date selection state:

- effective model, sequence, and precision selections read from global filter state
- `selectedGPUs`, `selectedDates`, `selectedDateRange`, and `activeDates`
- `activeHwTypes`, `bestPerSku`, and `quickFilters`
- effective run selection, custom cost and power values, preset state, and compare scope

This domain owns inference-only selection state. GPU selections and comparison dates
do not belong in global filter state because evaluation and reliability do not use
them.

**`useInferenceDisplay`**

Axis and presentation state:

- selected x-axis and y-axis metrics, percentile, and effective x-axis mode
- token-revenue price source (`i_revenue`): normalized uncached/cached/output pricing or the selected model's live OpenRouter catalog prices
- scale, optimal-point, label, contrast, legend, and overlay controls

Display changes stay in this domain. A contrast or label toggle therefore does not
notify filter-only or data-only consumers.

**`useInferenceActions`**

All inference commands and setters. The context value and every exposed action keep
stable identities. The provider routes each stable action to the latest implementation,
so new availability or chart data cannot invalidate action-only consumers.

Run filtering remains inference-local. `filteredAvailableRuns` narrows global run
availability to the effective model and precisions. `effectiveSelectedRunId` is
validated within that set but is not written back through the global run action, so a
precision-specific fallback cannot replace the user's global run intent.

---

### EvaluationProvider

File: `packages/app/src/components/evaluation/EvaluationContext.tsx`

Depends on `GlobalFilterProvider` for model and global date intent.

**Selection state**:

- requested evaluation date plus a reducer-derived nearest valid `selectedRunDate`
- `selectedBenchmark` (`e_bench`)

Explicit evaluation date actions synchronize the global requested date only when that
date exists in inference availability. Global changes are reducer inputs rather than a
pair of bidirectional mirroring effects.

**UI state**:

- `highContrast` (`e_hc`), `isLegendExpanded` (`e_legend`), `showLabels` (`e_labels`)
- `enabledHardware` — toggle set of visible hardware keys

**Derived**:

- `availableDates` — dates with eval rows for the selected model (derived from raw `EvalRow[]`, not from `availabilityRows`)
- `availableBenchmarks` — all unique tasks across raw rows
- `availableHardware` — hardware keys in raw rows
- `unfilteredChartData`, `chartData` — processed eval results; `chartData` is `unfilteredChartData` filtered by `enabledHardware`
- `hwTypesWithData` — `Set<string>` of hardware keys in `unfilteredChartData`
- `highlightedConfigs`, `changelogEntries`

**Why a separate `selectedRunDate`**: Eval dates can differ from benchmark dates. EvaluationProvider maintains its own date and syncs it with `GlobalFilterContext` only when the date is present in inference availability, preventing a mismatch from breaking the inference chart.

---

### ReliabilityProvider

File: `packages/app/src/components/reliability/ReliabilityContext.tsx`

Does NOT consume `GlobalFilterProvider`. Fully standalone — reliability data has no cross-tab filter dependency.

**Selection state**:

- `dateRange` — one of `last-3-days | last-7-days | last-month | last-3-months | all-time` (`r_range`)

**UI state**:

- `highContrast` (`r_hc`), `isLegendExpanded` (`r_legend`), `showPercentagesOnBars` (`r_pct`)
- `enabledModels` — toggle set of visible model keys

**Derived**:

- `dateRangeSuccessRateData` — raw `ReliabilityRow[]` aggregated into buckets; all five ranges computed once
- `filteredReliabilityData` — data for the active `dateRange`
- `chartData` — `filteredReliabilityData` filtered by `enabledModels` and sorted
- `availableModels`, `modelsWithData`

---

### Route-Owned Providers

**TCO Calculator**: the route parses a typed URL seed and mounts the sole
`GlobalFilterProvider` for the calculator. Calculator-specific visibility, target, and
bar selection transitions live in one reducer. `visibleHwKeys` remains the single
source of truth for official and unofficial bars.

**Historical Trends**: mounts `InferenceProvider` and shares the global filter provider
declared by its route capability.

**Reliability**: mounts only `ReliabilityProvider`.

**GPU Specs and other static/internal pages**: mount no data providers.

---

## Availability Filtering Cascade

This is the chain an agent must understand before touching any filter:

```
useAvailability()
  → returns AvailabilityRow[] (all model/sequence/precision/date/hardware combos)

GlobalFilterProvider
  → availableModels   = models that have any AvailabilityRow
  → selectedModel     (user pick)
  → modelRows         = availabilityRows filtered to selectedModel (internal memo)
  → availableSequences = unique sequences in modelRows
  → effectiveSequence  = Agentic (if unchosen and in availableSequences),
                         else selectedSequence if in availableSequences,
                         else 8k/1k if available, else availableSequences[0]
  → availablePrecisions = unique precisions in modelRows where sequence = effectiveSequence
  → effectivePrecisions = selectedPrecisions ∩ availablePrecisions; falls back to [availablePrecisions[0]]
  → availableDates     = unique dates in modelRows where sequence = effectiveSequence
                         AND precision ∈ effectivePrecisions
  → effectiveRunDate   = latest of availableDates (unless user explicitly picked a date)

InferenceProvider (receives availability rows from `useGlobalFilterAvailability`)
  → availableGPUs     = availabilityRows filtered to (model, effectiveSequence, effectivePrecisions)
                        → hwKey extracted via buildAvailabilityHwKey()
                        → filtered by isKnownGpu() (base GPU in HW_REGISTRY)
                        → sorted by getModelSortIndex
  → selectedGPUs      (user pick, subset of availableGPUs)
  → dateRangeAvailableDates = availableDates, narrowed further to dates where selectedGPUs have data
```

**"Effective" values and auto-correction**: When a previously valid user selection becomes invalid after a model or sequence change, `effectiveSequence` / `effectivePrecisions` silently switch to the nearest valid option. Components always consume `effectiveSequence` / `effectivePrecisions`, never `selectedSequence` / `selectedPrecisions` directly. This prevents empty-chart states on filter transitions.

**Stale GPU cleanup**: InferenceProvider runs an effect (lines 457–462) that removes entries from `selectedGPUs` that are no longer in `availableGPUs`. This keeps GPU comparison state consistent when the model changes.

---

## Comparison Date Mechanics

How the GPU-across-time comparison works in the inference tab:

1. User selects one or more GPUs (`selectedGPUs`) and comparison dates (`selectedDates` or `selectedDateRange`).
2. `useChartData` (in `InferenceProvider`) calls `buildComparisonDates()` to deduplicate and exclude the main `effectiveRunDate`.
3. `useQueries` fires one `useBenchmarks(model, date)` request per comparison date in parallel, alongside the main date query.
4. **Date stamping**: Each row from a comparison query is overwritten with `{ date: comparisonDates[i], actualDate: r.date }`. The `actualDate` field preserves the real DB date. Without this stamp, `activeDates` (keyed by user-selected date strings like `2025-01-15_h100-sxm`) would never match the rows' `date` field, so the toggle set would have no effect.
5. `activeDates` is a `Set<string>` of `${date}_${gpuKey}` composite keys. It is initialised to all IDs whenever `allDateIds` changes (effect at line 473). Users toggle individual overlays on/off.
6. Rows from all dates are merged into a single `rows` array and passed through `transformBenchmarkRows` — the chart renders all of them on the same axes, coloured by GPU + date.

**When the latest date is selected as the main run date**: `useChartData` maps the selected date to `''` if it equals `latestAvailableDate`, reusing the no-date query key from the materialized view rather than firing a duplicate request.

---

## URL State Synchronization

Source files: `packages/app/src/lib/url-state.ts`, `packages/app/src/hooks/useUrlState.ts`, `packages/app/src/hooks/useChartContext.ts` (`useUrlStateSync`).

### Prefix convention

| Prefix | Scope                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| `g_`   | Global filter run and selection contexts: model, run date, run ID                   |
| `i_`   | Global selection plus InferenceProvider: sequence, precision, GPUs, metrics         |
| `e_`   | EvaluationProvider — eval date (only when it differs from globalRunDate), benchmark |
| `r_`   | ReliabilityProvider — date range, display toggles                                   |

Note: `i_seq` and `i_prec` are written by `GlobalFilterProvider` because selection state is owned by `useGlobalFilterSelection`, not InferenceProvider.

### Snapshot, external subscriptions, and writes

`url-state.ts` snapshots known share parameters at module load and removes them from the
visible address bar after hydration while preserving the pathname and hash. Route-owned
entry points pass typed seeds where they render URL-controlled state on the server.

Live address-bar consumers use the shared `useClientSearch` external store. It subscribes
once to `popstate` and `CLIENT_SEARCH_CHANGE_EVENT` through `useSyncExternalStore`;
components do not mirror search strings through independent effects.

`writeUrlParams` batches state serialization for 150 ms. `useUrlStateSync` and explicit
state actions write requested/user state, not derived fallbacks.

The mutable remount snapshot and explicit URL intent are separate. Debounced
filter writes update the remount snapshot so providers preserve current state,
but they do not become explicit share-link choices that block automatic
unofficial-run model selection. A real navigation rebuilds the explicit-intent
set from the destination URL.

### Carrying state across a full-document navigation

The two effects above combine into a trap: filter changes reach only the
in-memory `currentState`, and the address bar is stripped clean, so **the URL of
the `/inference` history entry describes nothing**. Any full-document navigation
away from the chart therefore destroys the state entirely — the module is torn
down, and Back returns to a bare `/inference` that rebuilds from defaults.

The agentic point-detail links (`/inference/agentic/<id>`, rendered by
`tooltipUtils.viewChartsButtonHTML` and `legend-points-table.pointDetailHref`)
are exactly that: plain `<a href>`, deliberately, so browsers can offer
open-in-new-tab. Three helpers in `url-state.ts` bridge the gap:

| Helper                      | Used by                                                      | Why                                                                           |
| --------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `rememberChartStateInUrl()` | the point-click handlers (Scatter / GPU graph, legend table) | `history.replaceState`s the chart state onto the entry Back will return to    |
| `withChartState(href)`      | `agenticDetailHref()`                                        | appends it to the outbound link so the detail page can link back to that view |
| `currentChartSearch()`      | both of the above                                            | resolves the tab through the `/zh` prefix, flushes pending writes, filters    |

The detail page reads the state back through `withChartState` (its own URL was
snapshotted into `currentState` at load, then stripped as usual), which is what
makes its "Inference chart" link land on the chart the reader left rather than
on defaults.

### Re-hydration on client-side navigation

`useUrlState` calls `refreshUrlParamsOnNavigation(pathname)` **during render**,
guarded by a module-level last-pathname so it runs at most once per navigation.
The refresh first flushes pending debounced writes, then applies explicit
destination parameters over that current state. This prevents a rapid filter
change followed by a retained-provider tab switch from replaying the previous
selection.

That ordering also matters because providers read `getUrlParam` in `useState`
initialisers and mount effects, both of which run before any parent's layout
effect. With the hook-level refresh, every provider sees the params of the page
it actually landed on. The once-per-pathname guard keeps a late-mounting
component from replaying a stale URL over subsequent filter changes.

### Share URL construction

`buildShareUrl()` preserves the exact current pathname, locale prefix, dynamic slug, and
hash. It filters parameters using `shareParamScopes` from the canonical dashboard route
registry and carries the canonical `unofficialruns` value from the live URL.

### Parameter registry

`UrlStateKey`, `URL_STATE_KEYS`, and `PARAM_DEFAULTS` in
`packages/app/src/lib/url-state.ts` are the exhaustive parameter source of truth.
Dashboard scope membership is declared by `shareParamScopes` in
`packages/app/src/lib/dashboard-routes.ts`. Tests enforce completeness and route-specific
share behavior, so this document deliberately does not duplicate a manually maintained
parameter table.
