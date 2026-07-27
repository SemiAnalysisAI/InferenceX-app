# TCO Calculator — Design Rationale

## Why Interpolation Instead of Raw Data

Users want to compare GPUs at a specific interactivity target (e.g., "which GPU is cheapest at 200 tok/s/user?"). Raw benchmark data has discrete concurrency points, so GPU A might have data at 180 and 220 tok/s but not exactly 200. Interpolation fills the gaps using the same Pareto front + monotone spline used for roofline curves.

This means the calculator's values are **estimates derived from real data points**, not direct measurements. The disclaimer "Values are interpolated from real InferenceX benchmark data points" makes this explicit.

## Why Steffen Method for Splines

The Steffen method (monotone cubic Hermite) was chosen over standard cubic splines because:

1. **Monotonicity**: Prevents the spline from overshooting between data points. Standard cubic splines can produce negative throughput values between two positive points.
2. **D3 compatibility**: Matches `d3.curveMonotoneX`, so interpolated values align visually with the roofline curves drawn on charts.
3. **Despite monotonicity, edge cases still overshoot**: Sparse data or steep gradients can produce negative values. All results are clamped to `Math.max(0, ...)`.

## Multi-Precision Composite Keys

When comparing FP4 vs FP8 for the same GPU, each precision needs its own Pareto front and spline. The composite key `hwKey__precision` (e.g., `gb200-nvl72-sglang__fp4`) ensures:

1. Separate Pareto fronts per precision (mixing them would create invalid curves)
2. Separate bars in the chart (users see FP4 and FP8 side by side)
3. The `__` separator can't appear in hwKey (uses `-` and `_`) or precision names, so parsing is unambiguous

`InterpolatedResult.resultKey` = composite key (for selection/comparison). `.hwKey` = base key (for color/config lookup). `.precision` = only set when multi-precision active.

## Cost Field Matrix (3x3)

9 combinations of cost provider x token type because:

- **Cost providers** (Hyperscaler/Neocloud/3yr Rental) have different $/GPU/hr rates per GPU
- **Token types** (Total/Input/Output) have different throughput denominators

|                         | Total   | Input    | Output        |
| ----------------------- | ------- | -------- | ------------- |
| **Hyperscaler (costh)** | `costh` | `costhi` | `costhOutput` |
| **Neocloud (costn)**    | `costn` | `costni` | `costnOutput` |
| **3yr Rental (costr)**  | `costr` | `costri` | `costrOutput` |

`getCostField()` maps `(provider, tokenType)` → field name, avoiding a 9-way switch in every rendering path.

## Token Type — Most Common Bug

When adding any metric or rendering path that touches throughput, cost, or power: it MUST go through `getThroughputForType()` / `getCostForType()` / `getTpPerMwForType()`. Never access `result.costh` directly.

Verify ALL of these use the helper: chart title, bar value, table cell, tooltip, sort key, comparison text.

## Context-Aware Badges

Badges change based on metric because showing power badges when the metric is "Cost" would be confusing:

- **Throughput metric**: No badges (doesn't depend on assumed constants)
- **Cost metric**: TCO $/GPU/hr badges (assumed hourly rates per GPU, sourced from SemiAnalysis AI Cloud TCO Model)
- **tok/s/MW metric**: Power/GPU badges (assumed power draw per GPU, sourced from SemiAnalysis Datacenter Industry Model)

## Why No Separate Context Provider

The calculator reuses `GlobalStateContext` (model, run date) and `InferenceChartContext` (sequence, precisions). Calculator-specific state (cost provider, token type, bar metric, target interactivity, selected bars) is local `useState`.

Adding another context provider to the nesting hierarchy would increase re-render surface for unrelated tabs. Since calculator state doesn't need to be shared, local state is simpler and more performant.

## Bar Selection & Comparison

Click-to-compare uses `resultKey` (not hwKey) because multi-precision mode produces multiple bars per GPU. Comparison ratios use the lower value as denominator (ratio >= 1.0). Both metric and token type are reflected in the comparison text to avoid ambiguity.

## Unofficial-Run Overlays (`?unofficialrun=`)

A loaded unofficial run contributes an extra bar per (hardware × run) to the bar chart, in the run's palette color (`overlayRunColor`) and labeled `B300 (✕ my-branch)`. The label keeps the branch inside the same paren group as the precision so the `twoRowYAxisLabels({ split: 'parens' })` y-axis customizer still splits it into two rows.

**Overlay results are interpolated separately from official ones.** `useThroughputData` builds two group maps — `gpuDataByGroupKey` (official) and `overlayGpuDataByGroupKey` (per-run, keyed `hwKey[__precision]__run<idx>`) — and runs `interpolateForGPU` over each independently. Folding overlay points into the official Pareto front would silently move the official numbers, and you'd lose the before/after delta that makes the overlay useful in the first place.

Both paths share one row → `GPUDataPoint` mapper, `buildGpuGroups`, so an overlay bar and its official twin can never differ because of a mapping drift. Group identity is carried in `gpuGroupMeta` / `overlayGroupMeta` rather than re-parsed out of the key string; `FleetPlanner` still splits keys itself, which is safe because official keys are unchanged.

Overlay rows arrive unfiltered by model (the unofficial-run API returns every model in the run, while `/api/v1/benchmarks` is already model-scoped), so the hook filters them with `DB_MODEL_TO_DISPLAY`.

**Only the bar chart and its legend show overlay data.** The table view, CSV export, and fleet planner deliberately stay official-only — an exported sheet or an MW projection that silently blends in numbers from an unmerged branch is worse than one that omits them. This is why `barResults` (official + overlay) exists separately from `results` (official) and only reaches `ThroughputBarChart`.

Legend behavior:

- One entry per run that contributes bars, same shape as the inference/evaluation overlay legends (`✕ <branch>`, palette swatch, workflow link). The entry is inert — per-run removal happens in the banner.
- Hardware entries merge official hardware with hardware only the run has data for (`legendHwKeys`), otherwise an overlay-only bar would be unhideable.
- Toggling a hardware entry mirrors into the provider's shared `activeOverlayHwTypes`, so one click hides both a GPU's official and overlay bar. The mirror is scoped to hardware in the current selection — that set is shared with the inference and evaluation tabs, and out-of-scope keys must keep whatever the user set there.

Note the calculator only supports fixed-sequence data (`sequenceToIslOsl`: 1k/1k, 1k/8k, 8k/1k). Agentic-traces rows carry null isl/osl and are invisible here for official and unofficial data alike. E2E fixtures therefore use `singleTurnRows` from `cypress/support/overlay-fixtures.ts`, not the agentic `b300Rows` the inference specs use.
