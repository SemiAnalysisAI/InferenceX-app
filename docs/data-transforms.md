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

**`InferenceData`** (`components/inference/types.ts`) is a chart-ready scatter point. It extends `Partial<AggDataEntry>` with chart coordinates (`x`, `y`), derived metric objects shaped as `{ y: number; roof: boolean }`, and narrowed boolean types for the `dp_attention`/`disagg` family. Derived metric objects start with `roof: false`; current frontier membership is computed separately from the selected metric and chart direction.

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
4. Builds canonical derived fields once per prepared entry, then calls `createChartDataPoint` for each chart definition with that definition's `x`/`y` keys and the shared fields. The same `AggDataEntry` and derived objects are reused across both charts.

Returns `{ chartData: InferenceData[][], hardwareConfig: HardwareConfig }`.

### Step 2: AggDataEntry to InferenceData (`lib/chart-utils.ts`)

**`createChartDataPoint(date, entry, xKey, yKey, hwKey, derivedFields?)`** spreads `entry` first, then overrides chart coordinates and metadata. The full transform passes precomputed derived fields; direct callers may omit them.

- `x` / `y`: read directly from `entry[xKey]` and `entry[yKey]` (set per chart definition).
- `tp` is the total chip count: disaggregated configs sum `num_prefill_gpu + num_decode_gpu`; aggregate configs prefer a positive `num_decode_gpu`, then `num_prefill_gpu`, with TP × PP as a minimum even when a positive count is present. Legacy ingest defaults can populate counts as TP × EP without PP; this floor preserves pipeline parallelism for existing rows and unofficial overlays. Aggregate role counts describe the same deployment and are not summed. The actual tensor-parallel width remains in `decode_tp`.
- Boolean narrowing: `dp_attention`, `prefill_dp_attention`, `decode_dp_attention`, and `is_multinode` are coerced from `boolean | string` to `boolean | undefined`.
- Disagg fields: `num_prefill_gpu` / `num_decode_gpu` are only set when `entry.disagg` is true; otherwise they are dropped.

**`buildDerivedChartFields(entry, hwKey, requestedMetrics?)`** is the sole owner of inference and historical trend formulas. The full transform requests every benchmark-backed field. History requests only the selected metric and its interpolation dependencies, so it stays lightweight. Each emitted value uses `{ y: number; roof: boolean }`.

- `tpPerGpu`, `outputTputPerGpu`, `inputTputPerGpu` — raw throughput from the entry (tok/s/gpu).
- `tokenRevenuePerGpuHour` uses cache-aware token sale pricing. `buildDerivedChartFields` emits a normalized placeholder; `applyTokenRevenuePricing` applies the selected normalized or OpenRouter prices to uncached input, cached input, and output. Revenue is the priced streams per GPU-second scaled to one hour. Normalized pricing uses $1/M for uncached input and output and $0.10/M for cached input. OpenRouter uses its published cache-read price when available, otherwise 10% of the prompt price. Agentic cache share uses the same measured GPU-plus-external-or-CPU rule as Fleet Lifecycle. Aggregate rows use their measured input/output split; disaggregated rows derive a like-for-like split from fixed ISL:OSL or measured agentic prompt:generation totals because their raw input/output rates use different prefill/decode GPU denominators. Historical Trends splines total throughput, token share, and cache hit independently before applying these prices; a partly measured cache frontier receives no cache discount.
- `tpPerMw` — `(tputPerGpu * 1000) / hardwarePower` (GPU power in kW, result in tok/s/MW).
- Cost-per-million fields — GPU hourly cost divided by tokens-per-hour (in millions): `costh` / `costr` for owning-at-large-hyperscaler-volume / 3-year-rental pricing respectively. Three token variants exist: combined (`costh`/`costr`), output-only (`costhOutput`/`costrOutput`), and input-only (`costhi`/`costri`). The former Neocloud tier (`costn`/`costni`/`costnOutput`) was removed; its share-link keys alias to the hyperscaler-volume metric.
- Infrastructure purchasing-power fields divide tokens per hour by the same hourly costs. Total (`tokensPerDollarH`/`R`), output-only (`outputTokensPerDollarH`/`R`), and input-only (`inputTokensPerDollarH`/`R`) are separate USD Y-axis metrics. The former ¥-priced `tokensPerRmb*` axes and the Neocloud `*PerDollarN` axes were removed; their share-link keys alias to the matching hyperscaler-volume $ metric. The dashboard defaults to the hyperscaler-volume total-tokens-per-dollar axis (`y_tokensPerDollarH`). Links created for the removed API-price `i_metric=y_tokensPerDollar` axis resolve to the same hyperscaler-volume variant.
- Energy fields — `jTotal` / `jOutput` / `jInput`: `(hardwarePower * 1000) / tputPerGpu` (Joules per token, where power in kW is converted to W). These divide one GPU's all-in power by that GPU's reported throughput; for disaggregated rows `output_tput_per_gpu` is per decode GPU, so `jOutput` ignores the prefill pool. Its semantics are frozen; the whole-deployment view lives in the power boundaries below.
- Power-boundary fields — see [Power boundaries](#power-boundaries).

#### Power boundaries

`lib/power-basis.ts` derives the three boundaries beyond GPU-measured telemetry as W per allocated GPU plus J per successful output token. `buildDerivedChartFields` calls `buildPowerBasisChartFields(entry, specs)` right after the measured fields, so the official chart, the `?unofficialrun=` overlay (`transformBenchmarkRows`), and Historical Trends (`rowToLightweightPoint` with `requestedMetrics`) share one formula set; each key is gated by `wants(key)` so selective output stays exact.

| Basis                                         | W / GPU                                                                    | J / output token                   | Fields                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| B1 GPU measured                               | `avg_power_w`                                                              | `joules_per_output_token`          | existing `measuredAvgPower`, `measuredJPerOutputToken` (unchanged) |
| B2 GPU provisioned                            | `HW_REGISTRY.tdp`                                                          | `W × N_alloc ÷ total output tok/s` | `gpuProvisionedWatts`, `gpuProvisionedJPerOutputToken`             |
| B3 utility provisioned (all-in)               | `HW_REGISTRY.power × 1000`                                                 | `W × N_alloc ÷ total output tok/s` | `utilityProvisionedWatts`, `utilityProvisionedJPerOutputToken`     |
| B4 utility modeled (measured → chassis → PUE) | `modeledSystemPower.deploymentFacilityWatts ÷ modeledSystemPower.gpuCount` | `B1 J/out × (B4 W ÷ B1 W)`         | `utilityModeledWatts`, `utilityModeledJPerOutputToken`             |

- **N_alloc and total throughput** (`powerBasisNormalization`). Aggregate rows report output per allocated GPU, so `N_alloc` cancels and the builder uses `W ÷ output_tput_per_gpu` without trusting display counts (legacy ingest can encode TP × EP twice). Fixed-sequence disaggregated rows (`disagg && benchmark_type === 'single_turn'`) report output per decode GPU while the deployment also powers the prefill pool, so `total output tok/s = output_tput_per_gpu × num_decode_gpu` and `N_alloc = num_prefill_gpu + num_decode_gpu`; the article's 4P+4D counts eight GPUs, and B3 energy is `(P + D) / D` times `jOutput` on such rows. Other disaggregated benchmark types emit no provisioned energy because it is not verifiable in-app whether AgentX throughput already divides by all GPUs.
- **B4 source.** Reuses the `SystemPowerEstimate` that `rowToAggDataEntry` attached as `entry.modeledSystemPower`; nothing re-runs `modelSystemPower`. `deploymentFacilityWatts` is chassis AC × PUE with PUE applied exactly once inside `estimateChassisPower`, divided by the physical measured GPU count (not `modeledGpuCount`, which over-counts partially allocated chassis: a 4P+4D deployment on two worker hosts models 16 GPUs while measuring 8, and the unit test pins that divisor). This is a different quantity from the existing `modeledChassisPowerPerGpu` (chassis AC ÷ modeled GPU count, no PUE). Modeled energy scales the producer's same-window `joules_per_output_token` by `B4 W ÷ avg_power_w`, so it inherits B1's token denominator and survives rows whose `output_tput_per_gpu` is missing (the provisioned energies do not; a per-basis point count cannot assume one shared denominator).
- **Null rules.** A value is emitted only when finite and positive; otherwise the key is omitted (never `{ y: 0 }`), because the metric filters drop points by `metricKey in point` and `remapInferencePoint` falls back to raw throughput when a key exists with an unusable value. B2/B3 W are absent for hardware without registry specs (`getGpuSpecs` returns zeros); their energies are also absent without output throughput or disaggregated counts. B4 requires `modeledSystemPower.status === 'supported'` and B1 watts (`avg_power_w` after `rowToAggDataEntry`'s `power_valid !== 0` admission); B4 energy additionally needs `joules_per_output_token`. Telemetry admission belongs to `modelSystemPower`, which accepts `power_valid === 1` with schema v2 or the validated unversioned single-node producer (`telemetryBasis: 'validated-unversioned-single-node'`), so B4 renders on exactly the rows that show B1 and `modeledChassisPowerPerGpu`; off-8k/1k workloads, unsupported hardware such as GB200/GB300 NVL72 (`reason: 'hardware'`), and telemetry/topology failures withhold it. The public API's `strictV2` row filter is not re-applied in the chart for B1, so it is not re-applied for B4 either (plan §3.1 describes B1 with that filter; the app's chart path is the authority here).
- **Ordering invariant** (unit-tested on real B200 telemetry): B3 ≥ B4 ≥ B1 and B2 ≥ B1 for both W/GPU and J/out on the same point.
- **Reconstructed prefill energy** (`reconstructedPrefillJPerOutputToken`, `utils/role-energy.ts`). For validated (`power_valid === 1`, schema 2) disaggregated rows, `prefill_joules_per_input_token × (joules_per_output_token ÷ joules_per_input_token)` carries the prefill pool's energy onto the output-token axis: the ratio is the served input:output token count because schema-2 aggregate energy has one numerator. With `decode_joules_per_output_token` it sums back to the deployment's J/out. It feeds only the `i_pcompare=roles` comparison on the energy axis (PowerX Figure 7) and is never a y-axis of its own; aggregate rows and rows missing any of the four inputs omit it.
- Historical Trends substitutes `output_tput_per_gpu := tput_per_gpu` for legacy rows lacking output throughput; provisioned energies in trends inherit that fallback.

**GPU specs lookup** happens inside `buildDerivedChartFields`. `getGpuSpecs(hwKey)` (`lib/constants.ts`) splits on `[-_]` to extract the base GPU token (for example, `"b200_trt_mtp"` becomes `"b200"`) and looks it up in `HW_REGISTRY`. Missing keys return zeroed specs, producing `0` cost/energy values rather than crashing.

### Step 3: Filtering, memoization, and rendering (`hooks/useChartData.ts`)

The hook runs a 5-step memoized pipeline:

1. **Fetch** — `useBenchmarks(model, date)` via React Query. When the selected date equals the latest available date, the query key is normalized to `''` to reuse the eagerly-cached materialized-view response and avoid a duplicate fetch.

2. **Comparison date merging** — for GPU-vs-GPU date comparisons, `useQueries` fires one additional fetch per comparison date. Each row is stamped with the _user-selected_ comparison date (overriding the actual DB date) so that `GPUGraph`'s `activeDates` filter, which is keyed by user-selected date, matches the points. The original DB date is preserved in `actualDate`.

3. **Sequence filter + transform** — rows are filtered to `isl`/`osl` for the selected sequence, then passed to `transformBenchmarkRows`. This is the only place `transformBenchmarkRows` is called in normal rendering.

4. **Sort `hardwareConfig`** — the `HardwareConfig` object is sorted by `getModelSortIndex` and stabilized with a ref: if the sorted key string matches the previous render, the same object reference is returned. This prevents D3 Effect 2 (data bind) from firing when a sequence change returns the same GPU set.

5. **Build renderable graphs** — `stableChartDefinitions` is computed in a separate `useMemo` that depends only on metric/axis selections (not on data). This decouples Y-axis changes from data changes so D3 Effect 3 (metric repositioning) does not fire alongside Effect 2 (data bind). Within this memo, the x-axis field is resolved per chart type, roofline directions are flipped when the x-axis polarity reverses (e.g. interactivity → TTFT), and Y-axis labels are looked up. The final `graphs` memo applies GPU filtering, cost-limit clipping, optional user-cost/user-power overrides, and remaps each point's `x`/`y` from the selected metric's `{ y, roof }` object.

---

## Hardware Key Construction

This is the most complex and bug-prone part of the pipeline. A bad hardware key produces either a missing legend entry, zeroed cost/energy metrics (because `getGpuSpecs` returns zeros), or a chart point that never matches the active hardware filter.

**`getHardwareKey(entry)`** (`lib/chart-utils.ts`) — builds the canonical key:

1. Base GPU: `entry.hw.split('-')[0]` strips any `-DP` / `-MN` variant suffix from the hardware field (e.g. `"h100-8"` → `"h100"`).
2. Framework suffix: appends `_${entry.framework}`. The direct key (`h100_trt`) is tested via `isKnownGpu()` (checks whether the base GPU exists in `HW_REGISTRY`). If the direct key's base is unknown and `entry.disagg` is true, a `-disagg` variant is tried.
3. Spec decoding suffix: for fixed-sequence rows, if `entry.mtp === 'on'` or `entry.spec_decoding === 'mtp'`, appends `_mtp`. Otherwise, any non-`'none'` `spec_decoding` value is appended as-is (e.g. `_eagle`). Agentic rows deliberately omit this suffix because one production curve may combine speculative and standard-decoding points; `spec_decoding` remains on each point for filtering, tooltip metadata, and point-level identity.

The resulting key's base GPU must exist in `HW_REGISTRY`. Display fields (label, suffix, gpu tooltip) are derived dynamically by `getHardwareConfig()`. Unrecognised base GPUs fall back to the `unknown` hardware config.

**Three variants exist for different data sources:**

- `getHardwareKey(entry: AggDataEntry)` — for benchmark data (the normal path described above).
- `normalizeEvalHardwareKey(hw, framework?, specDecoding?)` (`lib/chart-utils.ts`) — for evaluation/reliability rows which use looser naming (e.g. `"B200 NB"`, `"H200 CW"`). Strips known qualifiers (`nb`, `cw`, `nv`, etc.) before building the key. Returns `'unknown'` if the base GPU is not in `HW_REGISTRY`.
- `buildAvailabilityHwKey(hardware, framework?, specMethod?, disagg?)` (`lib/chart-utils.ts`) — for availability rows. Follows the same disagg-variant logic as `getHardwareKey` but uses `resolveFrameworkAlias` to normalize framework aliases before lookup.

**Alias remapping** (`lib/constants.ts`) — `GPU_KEY_ALIASES` maps a canonical key to one or more legacy keys (e.g. `gb200_dynamo-trtllm` was renamed to `gb200_dynamo-trt`). The inverse map `GPU_ALIAS_TO_CANONICAL` is used in `filterByGPU` to treat alias keys as their canonical equivalent when the user selects a GPU from the filter panel.

---

## Chart Configuration

`metric-registry.ts` owns metric fields, English and Chinese labels, titles, polarity, and control ordering. It derives exactly two `ChartDefinition` objects:

| `chartType`     | Default x-axis  | x meaning                                                      |
| --------------- | --------------- | -------------------------------------------------------------- |
| `interactivity` | `median_intvty` | Interactivity (tok/s/user) — higher = more responsive per user |
| `e2e`           | `median_e2el`   | End-to-end latency (s) — lower = faster                        |

Both charts share the same Y-axis options. The `y` field is the default `AggDataEntry` key used for raw Y values; each `y_{metric}` field overrides this with a dotted path into the `InferenceData` derived fields (e.g. `"tpPerGpu.y"`).

**Per-metric Y-axis schema** is owned once in `METRIC_REGISTRY`:

- `field`: dotted path for the value (for example, `"costh.y"`).
- `label` / `labelZh`: bilingual Y-axis labels.
- `title` / `titleZh`: bilingual dropdown and chart titles.
- `polarity`: whether higher or lower values are preferable. The derived chart definitions combine this with x-axis polarity to produce the concrete Pareto corner.

**X-axis selection** takes precedence over the Y metric: selecting an input-energy metric keeps the chosen Interactivity, TTFT, or E2E axis. Fixed-sequence TTFT uses the measured median; agentic TTFT uses the selected percentile. Official data, unofficial overlays, and Replay share the resolved axis. Missing or zero-filled TTFT values are omitted instead of becoming plotted latency measurements. The legacy input-metric override (`inputTputPerGpu` declares `p90_ttft`) applies only to callers without a global x-axis mode.

**Limits** — both charts include `y_cost_limit: 5` (clip cost-per-million metrics above $5/M tokens) and `y_latency_limit: 60` (clip x-axis outliers beyond 60s when TTFT is on x). Tokens-per-dollar metrics are not cost-clipped; clipped cost points remain available to the dashed continuation layer.
