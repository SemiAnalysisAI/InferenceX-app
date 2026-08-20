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

Availability owns explicit settled and error states. Consumers must distinguish an
unresolved request from a settled empty result; inference fetches are gated on
`sequenceResolved` and render `availabilityError` rather than an indefinite skeleton.

**Derived availability** (memos over `availabilityRows`):

- `availableModels`, `availableSequences`, `availablePrecisions`, `availableDates`
- `availabilityRows`, `availabilitySettled`, `availabilityError`

**Workflow / run info** (derived from `useWorkflowInfo(effectiveRunDate)`):

- `availableRuns`, `workflowLoading`, `workflowError`

There is no response-shaped `workflowInfo` adapter. `RunInfo` and `availableRuns` are
the canonical run contract.

**Why here, not InferenceProvider**: Model, sequence, and precision are cross-tab. EvaluationContext consumes `selectedModel` and `availableModels` directly. If these lived in InferenceProvider, EvaluationProvider would need an indirect coupling or duplicate state.

---

### InferenceProvider

File: `packages/app/src/components/inference/InferenceContext.tsx`

Depends on: `GlobalFilterProvider` (reads all filter state and availability, including `availabilityRows`).

**GPU comparison state** (inference-only, URL-initialised):

- `selectedGPUs` — hardware keys selected for GPU filter/comparison (`i_gpus`)
- `selectedDates` — discrete comparison dates (`i_dates`)
- `selectedDateRange` — `{startDate, endDate}` for range comparisons (`i_dstart`, `i_dend`)
- `activeDates` — `Set<string>` toggle controlling visible comparison overlays (keyed by `${date}_${gpuKey}`)

**Chart axis / display state**:

- `selectedYAxisMetric` and `selectedXAxisMetric`
- requested x-axis mode plus derived `selectedXAxisMode`
- derived `selectedE2eXAxisMetric`, resolved from scenario and percentile
- `scaleType`, optimal/label/high-contrast/legend controls
- `colorShuffleSeed` (ephemeral)

**Derived availability** (GPU-level, computed from `availabilityRows` inherited from GlobalFilterContext):

- `availableGPUs` — hardware configs that have data for the current model + sequence + precisions AND have a known base GPU in `HW_REGISTRY`
- `dateRangeAvailableDates` — dates available for the current filter combination, further narrowed by `selectedGPUs`
- `hwTypesWithData` — `Set<string>` of GPU keys currently present in fetched chart data

**Hardware toggle set**:

- `activeHwTypes` — subset of `hwTypesWithData` that are visible (managed by `useChartDataFilter`)

**Tracked configs / presets**:

- `trackedConfigs` — up to 6 pinned data points for cross-chart comparison
- `activePresetId`, `pendingHwFilter` — active favourite preset and its deferred GPU filter

**User overrides**:

- `userCosts`, `userPowers` — per-GPU cost/power overrides for custom cost metric; reset when `selectedYAxisMetric` changes away from `y_costUser`/`y_powerUser`

**Run filtering** (inference-local, not written back to GlobalFilterContext):

- `filteredAvailableRuns` — `availableRuns` filtered to runs matching `selectedModel` + `effectivePrecisions`
- `effectiveSelectedRunId` — validated run ID within `filteredAvailableRuns`; intentionally NOT synced back to GlobalFilterContext to avoid full-tree re-renders on precision change

**Charts data** (from `useChartData`):

- `graphs` — `RenderableGraph[]` used by all D3 charts
- `hardwareConfig` — config map derived from benchmark rows
- `loading`, `error`

**Why not in GlobalFilterContext**: GPU selection and comparison dates are meaningless outside the inference/historical tabs. Putting them in the global context would pollute the interface for evaluation and reliability.

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

InferenceProvider (receives availabilityRows from GlobalFilterContext)
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
| `g_`   | GlobalFilterContext — model, run date, run ID                                       |
| `i_`   | InferenceProvider — sequence, precision, GPUs, dates, metrics, display toggles      |
| `e_`   | EvaluationProvider — eval date (only when it differs from globalRunDate), benchmark |
| `r_`   | ReliabilityProvider — date range, display toggles                                   |

Note: `i_seq` and `i_prec` are written by `GlobalFilterProvider` (not InferenceProvider) because they live in GlobalFilterContext.

### Snapshot, external subscriptions, and writes

`url-state.ts` snapshots known share parameters at module load and removes them from the
visible address bar after hydration while preserving the pathname and hash. Route-owned
entry points pass typed seeds where they render URL-controlled state on the server.

Live address-bar consumers use the shared `useClientSearch` external store. It subscribes
once to `popstate` and `CLIENT_SEARCH_CHANGE_EVENT` through `useSyncExternalStore`;
components do not mirror search strings through independent effects.

`writeUrlParams` batches state serialization for 150 ms. `useUrlStateSync` and explicit
state actions write requested/user state, not derived fallbacks.

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
