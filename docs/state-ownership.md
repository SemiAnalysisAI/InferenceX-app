# State Ownership

Reference for agents modifying filter behavior. Explains which context to touch for a given change, how availability cascades, and how URL params are kept in sync.

## Provider Nesting

```
QueryProvider
  ThemeProvider
    UnofficialRunProvider
      GlobalFilterProvider          ← availability, model/sequence/precision/date/runId
        InferenceProvider           ← GPU selection, comparison dates, chart UI, y-axis metric
          inference tab
          historical tab (no own provider — reads InferenceContext)
        EvaluationProvider          ← benchmark, eval-specific date, hardware toggle
          evaluation tab
        ReliabilityProvider         ← date range, model toggle
          reliability tab
        calculator tab              ← no provider; local useState in ThroughputCalculatorDisplay
        gpu-specs tab               ← no provider; static data
```

Source: `packages/app/src/components/page-content.tsx` lines 203–239.

---

## Provider State Map

### GlobalFilterProvider

File: `packages/app/src/components/GlobalFilterContext.tsx`

**Selection state** (user-settable, URL-initialised):

- `selectedModel` — active model (`g_model`)
- `selectedSequence` — active ISL/OSL sequence (`i_seq`; owned here because it gates availability for all tabs)
- `selectedPrecisions` — active precision list (`i_prec`; same reason)
- `selectedRunDate` / `selectedRunId` — active benchmark run date and run ID (`g_rundate`, `g_runid`)

**Effective (auto-corrected) values** (derived, not settable directly):

- `effectiveSequence` — `selectedSequence` if valid for current model, else first available
- `effectivePrecisions` — subset of `selectedPrecisions` that are available; falls back to `[availablePrecisions[0]]`
- `effectiveRunDate` — latest available date unless user explicitly picked one

**Derived availability** (memos over `availabilityRows`):

- `availableModels`, `availableSequences`, `availablePrecisions`, `availableDates`
- `availabilityRows` — raw `AvailabilityRow[]` from `useAvailability()`, passed down to InferenceProvider for GPU filtering

**Workflow / run info** (derived from `useWorkflowInfo(effectiveRunDate)`):

- `availableRuns`, `workflowInfo`, `workflowLoading`, `workflowError`

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

**Chart axis / display state** (URL-initialised):

- `selectedYAxisMetric` (`i_metric`), `selectedXAxisMetric` (`i_xmetric`), `selectedE2eXAxisMetric` (`i_e2e_xmetric`)
- `scaleType` — `auto | linear | log` (`i_scale`)
- `hideNonOptimal` (`i_optimal`), `hidePointLabels` (`i_nolabel`), `logScale` (`i_log`)
- `highContrast` (`i_hc`), `isLegendExpanded` (`i_legend`)
- `useAdvancedLabels` (`i_advlabel`), `showGradientLabels` (`i_gradlabel`)
- `colorShuffleSeed` — no URL param; ephemeral

**Derived availability** (GPU-level, computed from `availabilityRows` inherited from GlobalFilterContext):

- `availableGPUs` — hardware configs that have data for the current model + sequence + precisions AND exist in `HARDWARE_CONFIG`
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

Depends on: `GlobalFilterProvider` (reads `selectedModel`, `setSelectedModel`, `selectedRunDate`, `selectedRunDateRev`, `setSelectedRunDate`, `availableModels`, `availableDates`).

**Selection state**:

- `selectedRunDate` — evaluation-specific date; initialised from `e_rundate` URL param or `globalRunDate`. Bidirectionally synced: when the user picks a date, it calls `setGlobalRunDate` (if the date exists in inference availability). When `globalRunDate` changes (from another tab), the effect at line 124 applies it here.
- `selectedBenchmark` — active eval task (`e_bench`)

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

### Tabs without providers

**TCO Calculator** (`calculator` tab): All state is local `useState` inside `ThroughputCalculatorDisplay`. It reads `effectiveSequence` and `effectivePrecisions` from `useGlobalFilters()` for the initial GPU list but does not share state back.

**Historical Trends** (`historical` tab): Rendered inside `InferenceProvider` (shares the `inference` + `historical` `isActive` gate). It reads `useInference()` directly — no additional provider. Uses InferenceContext's model/sequence/precision/date state.

**GPU Specs**: Static data, no provider.

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
  → effectiveSequence  = selectedSequence if in availableSequences, else availableSequences[0]
  → availablePrecisions = unique precisions in modelRows where sequence = effectiveSequence
  → effectivePrecisions = selectedPrecisions ∩ availablePrecisions; falls back to [availablePrecisions[0]]
  → availableDates     = unique dates in modelRows where sequence = effectiveSequence
                         AND precision ∈ effectivePrecisions
  → effectiveRunDate   = latest of availableDates (unless user explicitly picked a date)

InferenceProvider (receives availabilityRows from GlobalFilterContext)
  → availableGPUs     = availabilityRows filtered to (model, effectiveSequence, effectivePrecisions)
                        → hwKey extracted via buildAvailabilityHwKey()
                        → intersection with HARDWARE_CONFIG keys
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

### Snapshot-and-clear on load

`url-state.ts` runs at module-load time (before any React render). It reads all known keys from `window.location.search` into `_initialParams` and copies them into `currentState`. A `setTimeout(0)` callback then strips those keys from the URL via `history.replaceState`. This ensures the URL is clean after load — subsequent writes reflect only current state.

`useUrlState` caches `_initialParams` in a ref via `readUrlParams()` on first call. All `getUrlParam()` calls return from this snapshot, so providers initialize from the original share URL even if the cleanup timer has already run.

### Debounced write-back (150 ms)

`writeUrlParams(params)` merges incoming params into `pendingParams` and sets a 150 ms debounce timer. On flush, params matching their default in `PARAM_DEFAULTS` are deleted from `currentState`; non-defaults are stored. This keeps share URLs short.

`useUrlStateSync` (used by InferenceProvider, EvaluationProvider, ReliabilityProvider) skips the first render via `isMountedRef` to avoid overwriting the just-snapshotted URL params. GlobalFilterProvider uses a manually-written equivalent (lines 288–308 in `GlobalFilterContext.tsx`).

### Share URL construction

`buildShareUrl()` flushes pending writes, reads `currentState`, and filters to only the param prefixes relevant to the current tab (defined in `TAB_PARAM_PREFIXES`). Inference share URLs include `g_` + `i_` params; evaluation includes `g_` + `e_`; reliability includes only `r_`.

Historical Trends and TCO Calculator share the inference tab's URL path (`/inference` and `/calculator` respectively) but have no dedicated param prefix — they inherit whichever `i_` params are relevant.

### Full parameter list

| Param           | Owner               | Default                          |
| --------------- | ------------------- | -------------------------------- |
| `g_model`       | GlobalFilterContext | `DeepSeek-R1-0528`               |
| `g_rundate`     | GlobalFilterContext | `''`                             |
| `g_runid`       | GlobalFilterContext | `''`                             |
| `i_seq`         | GlobalFilterContext | `8k/1k`                          |
| `i_prec`        | GlobalFilterContext | `fp4`                            |
| `i_metric`      | InferenceProvider   | `y_tpPerGpu`                     |
| `i_xmetric`     | InferenceProvider   | `p99_ttft`                       |
| `i_e2e_xmetric` | InferenceProvider   | `''`                             |
| `i_scale`       | InferenceProvider   | `auto`                           |
| `i_gpus`        | InferenceProvider   | `''`                             |
| `i_dates`       | InferenceProvider   | `''`                             |
| `i_dstart`      | InferenceProvider   | `''`                             |
| `i_dend`        | InferenceProvider   | `''`                             |
| `i_optimal`     | InferenceProvider   | `''` (truthy = hide non-optimal) |
| `i_nolabel`     | InferenceProvider   | `''`                             |
| `i_hc`          | InferenceProvider   | `''`                             |
| `i_log`         | InferenceProvider   | `''`                             |
| `i_legend`      | InferenceProvider   | `''`                             |
| `i_advlabel`    | InferenceProvider   | `''`                             |
| `i_gradlabel`   | InferenceProvider   | `''`                             |
| `e_rundate`     | EvaluationProvider  | `''`                             |
| `e_bench`       | EvaluationProvider  | `''`                             |
| `e_hc`          | EvaluationProvider  | `''`                             |
| `e_labels`      | EvaluationProvider  | `''`                             |
| `e_legend`      | EvaluationProvider  | `''`                             |
| `r_range`       | ReliabilityProvider | `last-3-months`                  |
| `r_pct`         | ReliabilityProvider | `''`                             |
| `r_hc`          | ReliabilityProvider | `''`                             |
| `r_legend`      | ReliabilityProvider | `''`                             |
