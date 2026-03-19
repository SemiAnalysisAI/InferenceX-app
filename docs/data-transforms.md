# Data Transformation Pipeline

Explains the full chain from raw API response to chart-ready scatter points. Goal: let an agent understand type roles and where each transform lives without reading 5+ source files.

## Type Hierarchy

```
BenchmarkRow   (lib/api.ts)
    |
    v  rowToAggDataEntry()
AggDataEntry   (components/inference/types.ts)
    |
    v  createChartDataPoint()
InferenceData  (components/inference/types.ts)
    |
    v  useChartData.ts (filtering + memoization)
RenderableGraph[]  (consumed by ScatterGraph)
```

**`BenchmarkRow`** (`lib/api.ts`) — raw DB row. The `metrics` field is a loose `Record<string, number>` containing every measured stat. Config fields (hardware, framework, concurrency, topology) are top-level.

**`AggDataEntry`** (`components/inference/types.ts`) — flattened, fully-typed working representation. All metric keys are promoted to top-level fields with `?? 0` defaults. The display model name is resolved here. `hwKey` starts as an empty string and is filled in by `transformBenchmarkRows` after calling `getHardwareKey`. The `actualDate` field holds the real DB date when the `date` field has been overridden to a user-selected comparison date.

**`InferenceData`** (`components/inference/types.ts`) — chart-ready scatter point. Extends `Partial<AggDataEntry>` and adds: chart coordinates (`x`, `y`), all derived metrics as `{ y: number; roof: boolean }` objects, and narrowed boolean types for the `dp_attention`/`disagg` family. The `roof` flag is always `false` at creation and set to `true` by `markRooflinePoints` during the render phase.

**`RenderableGraph`** — final output of `useChartData`. Bundles `model`, `sequence`, `chartDefinition`, and `InferenceData[]` for a single scatter chart panel.

---

## Transformation Steps

### Step 1: API row to AggDataEntry (`lib/benchmark-transform.ts`)

**`rowToAggDataEntry(row)`** — does three things:
1. Flattens `row.metrics` into typed fields (e.g. `m.median_ttft ?? 0`).
2. Resolves the DB model slug to a human display name via `DB_MODEL_TO_DISPLAY`.
3. Copies all config fields (topology, disagg flags, image, dates) verbatim.

`hwKey` is left as `''` at this point — it is not known until `getHardwareKey` runs in the next phase.

**`transformBenchmarkRows(rows)`** — orchestrates the full BenchmarkRow[] → InferenceData[][] transform:
1. Converts every row to `AggDataEntry` once (via `rowToAggDataEntry`).
2. Calls `getHardwareKey(entry)` and writes the result back into `entry.hwKey`.
3. Calls `getHardwareConfig(hwKey)` with a per-call cache to build the `HardwareConfig` map (hardware display metadata — label, color, GPU title).
4. For each `ChartDefinition` in `inference-chart-config.json`, calls `createChartDataPoint` with that definition's `x`/`y` field keys to produce one `InferenceData` array per chart. The same `AggDataEntry` objects are reused across chart definitions — they are not re-created.

Returns `{ chartData: InferenceData[][], hardwareConfig: HardwareConfig }`.

### Step 2: AggDataEntry to InferenceData (`lib/chart-utils.ts`)

**`createChartDataPoint(date, entry, xKey, yKey, hwKey)`** — spreads `entry` first, then overrides with derived fields:

- `x` / `y`: read directly from `entry[xKey]` and `entry[yKey]` (set per chart definition).
- `tp`: for disaggregated configs, set to `num_prefill_gpu + num_decode_gpu` instead of `decode_tp`.
- Boolean narrowing: `dp_attention`, `prefill_dp_attention`, `decode_dp_attention`, and `is_multinode` are coerced from `boolean | string` to `boolean | undefined`.
- Disagg fields: `num_prefill_gpu` / `num_decode_gpu` are only set when `entry.disagg` is true; otherwise they are dropped.

**Derived metric fields** — each uses `{ y: number; roof: boolean }` so the chart layer can switch between them without re-fetching data:

- `tpPerGpu`, `outputTputPerGpu`, `inputTputPerGpu` — raw throughput from the entry (tok/s/gpu).
- `tpPerMw` — `(tputPerGpu * 1000) / hardwarePower` (GPU power in kW, result in tok/s/MW).
- Cost fields — GPU hourly cost divided by tokens-per-hour (in millions): `costh` / `costn` / `costr` for hyperscaler / neocloud / 3-year-rental pricing respectively. Three token variants exist: combined (`costh`/`costn`/`costr`), output-only (`costhOutput`/`costnOutput`/`costrOutput`), input-only (`costhi`/`costni`/`costri`).
- Energy fields — `jTotal` / `jOutput` / `jInput`: `(hardwarePower * 1000) / tputPerGpu` (Joules per token, where power in kW is converted to W).

**GPU specs lookup** — `createChartDataPoint` calls `getGpuSpecs(hwKey)` (`lib/constants.ts`) which splits on `[-_]` to extract the base GPU token (e.g. `"b200_trt_mtp"` → `"b200"`) and looks it up in `GPU_SPECS`. `GPU_SPECS` stores power (kW per GPU) and three cost tiers ($ per GPU-hour). Missing keys return zeroed specs, which produces `0` cost/energy values rather than crashing.

### Step 3: Filtering, memoization, and rendering (`hooks/useChartData.ts`)

The hook runs a 5-step memoized pipeline:

1. **Fetch** — `useBenchmarks(model, date)` via React Query. When the selected date equals the latest available date, the query key is normalized to `''` to reuse the eagerly-cached materialized-view response and avoid a duplicate fetch.

2. **Comparison date merging** — for GPU-vs-GPU date comparisons, `useQueries` fires one additional fetch per comparison date. Each row is stamped with the *user-selected* comparison date (overriding the actual DB date) so that `GPUGraph`'s `activeDates` filter, which is keyed by user-selected date, matches the points. The original DB date is preserved in `actualDate`.

3. **Sequence filter + transform** — rows are filtered to `isl`/`osl` for the selected sequence, then passed to `transformBenchmarkRows`. This is the only place `transformBenchmarkRows` is called in normal rendering.

4. **Sort `hardwareConfig`** — the `HardwareConfig` object is sorted by `getModelSortIndex` and stabilized with a ref: if the sorted key string matches the previous render, the same object reference is returned. This prevents D3 Effect 2 (data bind) from firing when a sequence change returns the same GPU set.

5. **Build renderable graphs** — `stableChartDefinitions` is computed in a separate `useMemo` that depends only on metric/axis selections (not on data). This decouples Y-axis changes from data changes so D3 Effect 3 (metric repositioning) does not fire alongside Effect 2 (data bind). Within this memo, the x-axis field is resolved per chart type, roofline directions are flipped when the x-axis polarity reverses (e.g. interactivity → TTFT), and Y-axis labels are looked up. The final `graphs` memo applies GPU filtering, cost-limit clamping, optional user-cost/user-power overrides, and remaps each point's `x`/`y` from the selected metric's `{ y, roof }` object.

---

## Hardware Key Construction

This is the most complex and bug-prone part of the pipeline. A bad hardware key produces either a missing legend entry, zeroed cost/energy metrics (because `getGpuSpecs` returns zeros), or a chart point that never matches the active hardware filter.

**`getHardwareKey(entry)`** (`lib/chart-utils.ts`) — builds the canonical key:

1. Base GPU: `entry.hw.split('-')[0]` strips any `-DP` / `-MN` variant suffix from the hardware field (e.g. `"h100-8"` → `"h100"`).
2. Framework suffix: appends `_${entry.framework}`. The direct key (`h100_trt`) is tested first. If the direct key is absent and `entry.disagg` is true, a `-disagg` variant is tried (`h100_trt-disagg`). If neither is in `HARDWARE_CONFIG`, the direct form is used anyway (it will warn at `getHardwareConfig` time).
3. Spec decoding suffix: if `entry.mtp === 'on'` or `entry.spec_decoding === 'mtp'`, appends `_mtp`. Otherwise, any non-`'none'` `spec_decoding` value is appended as-is (e.g. `_eagle`).

The resulting key must exactly match an entry in `HARDWARE_CONFIG`. A key that does not match falls back silently to the `unknown` hardware config.

**Three variants exist for different data sources:**

- `getHardwareKey(entry: AggDataEntry)` — for benchmark data (the normal path described above).
- `normalizeEvalHardwareKey(hw, framework?, specDecoding?)` (`lib/chart-utils.ts`) — for evaluation/reliability rows which use looser naming (e.g. `"B200 NB"`, `"H200 CW"`). Strips known qualifiers (`nb`, `cw`, `nv`, etc.) before building the key. Returns `'unknown'` if the result is not in `HARDWARE_CONFIG`.
- `buildAvailabilityHwKey(hardware, framework?, specMethod?, disagg?)` (`lib/chart-utils.ts`) — for availability rows. Follows the same disagg-variant logic as `getHardwareKey` but uses `resolveFrameworkAlias` to normalize framework aliases before lookup.

**Alias remapping** (`lib/constants.ts`) — `GPU_KEY_ALIASES` maps a canonical key to one or more legacy keys (e.g. `gb200_dynamo-trtllm` was renamed to `gb200_dynamo-trt`). The inverse map `GPU_ALIAS_TO_CANONICAL` is used in `filterByGPU` to treat alias keys as their canonical equivalent when the user selects a GPU from the filter panel.

---

## Chart Configuration

`inference-chart-config.json` defines exactly two `ChartDefinition` objects:

| `chartType` | Default x-axis | x meaning |
|---|---|---|
| `interactivity` | `median_intvty` | Interactivity (tok/s/user) — higher = more responsive per user |
| `e2e` | `median_e2el` | End-to-end latency (s) — lower = faster |

Both charts share the same Y-axis options. The `y` field is the default `AggDataEntry` key used for raw Y values; each `y_{metric}` field overrides this with a dotted path into the `InferenceData` derived fields (e.g. `"tpPerGpu.y"`).

**Per-metric Y-axis schema** — for each metric key (e.g. `y_costh`), the config carries:
- `y_{metric}`: dotted path for the value (e.g. `"costh.y"`).
- `y_{metric}_label`: Y-axis label string.
- `y_{metric}_title`: dropdown/UI title string.
- `y_{metric}_roofline`: Pareto direction (`upper_left`, `upper_right`, `lower_left`, `lower_right`). Roofline direction differs between chart types for the same metric because the x-axis polarity differs (interactivity: higher-is-better; E2EL: lower-is-better).

**Input-metric x-axis override** — when the selected Y metric's title contains `"input"`, the interactivity chart switches its x-axis to `p99_ttft` (or the user-overridden x metric). This is detected in `stableChartDefinitions` via `metricTitle.toLowerCase().includes('input')`. The config encodes the default override fields: `y_inputTputPerGpu_x: "p99_ttft"` and `y_inputTputPerGpu_x_label`.

**Limits** — both charts include `y_cost_limit: 5` (clamp cost-metric y-axis to $5/M tokens) and `y_latency_limit: 60` (filter x-axis outliers beyond 60s when TTFT is on x).
