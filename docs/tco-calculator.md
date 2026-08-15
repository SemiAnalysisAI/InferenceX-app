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

- One entry per run that contributes bars, same shape as the inference/evaluation overlay legends (`✕ <branch>`, palette swatch, workflow link). The entry is a label, not a series: per-run removal happens in the banner, so it sets `isRemovable: false` (a default-true opt-out on `CommonLegendItemProps`). Without it those always-active entries inflate `ChartLegend`'s `activeCount`, which is the guard that stops the hide control emptying the chart — and their own hide control would call `removeGpu` with an `overlay-run-*` key and do nothing.
- Hardware entries merge official hardware with hardware only the run has data for (`legendHwKeys`), otherwise an overlay-only bar would be unhideable.
- `visibleHwKeys` is the **single source of truth** for both series: one legend entry governs a GPU's official and overlay bars together.

That last point is deliberate and worth not "fixing" back. The obvious-looking alternative — read/write the provider's shared `activeOverlayHwTypes` for the overlay series — gives the one legend two backing sets, and every way they drift renders a legend entry that contradicts the bar beside it:

- the reset effect reseeds `visibleHwKeys` when the available hardware changes but has no business reseeding a set two other tabs share, so a GPU hidden before a model/sequence switch comes back as "active" in the legend with its overlay bar still hidden;
- the inference or evaluation tab re-enabling a GPU resurrects its calculator overlay bar while this tab's legend still marks it inactive.

Per-tab hardware visibility is already how the calculator treats official data — `visibleHwKeys` has never been shared with the inference tab — so the overlay series just follows the same rule. AGENTS.md's "respect `activeOverlayHwTypes`" exists so overlay points can't ignore a user's hide action; here the calculator's own legend _is_ that hide action. `calculator-overlay.cy.ts` pins the first scenario ("brings hidden overlay bars back when the available hardware changes").

### Seeding the legend selection

Two effects, and the split matters:

- **Reset** keys on the **official** hardware list (`availableHwKeys`) and reseeds `visibleHwKeys` to the merged list. A run is fetched separately from the benchmarks and usually lands later, so keying the reset on the merged list let a late overlay arrival — or a run dismissal — wipe GPU filters the user had already set.
- **Overlay arrival/departure** is applied **additively**: newly available overlay GPUs start visible, departed ones stop being tracked, everything else keeps whatever the user set. It falls back to all official hardware if the result would be empty, so dismissing a run while an overlay-only GPU was soloed can't leave a blank chart.

The reset's early-out guards on the **merged** list, not the official one. An empty official list is a real state — the "model/sequence exists only in the run" case this feature is for — and bailing on it would leave the previous selection's official keys in `visibleHwKeys`. `toggleGpuVisibility` therefore also counts visible keys against `legendHwKeys` rather than comparing raw set size, so a stale entry can never skew solo/show-all.

### Honesty in the tooltip

- **Clamped values.** `interpolateForGPU` clamps the target into each series' measured range and always returns a value, so a bar can be showing its nearest edge point rather than an interpolation. This is pre-existing across GPUs with different ranges, but widening the slider to cover overlay operating points makes it reachable for every official bar at once — which would turn a side-by-side overlay delta into a real-vs-clamped comparison. Results carry a `clamped` flag and the tooltip says so. (Narrowing the slider back is not the fix: it only moves the clamping onto the overlay bars, and an overlay-only model loses its bounds entirely.)
- **Escaping.** The tooltip is a hand-built HTML string injected with `.html()`, and branch names and run URLs come from the GitHub API for whatever run id the user pasted. Everything untrusted goes through `escapeHtml` (`lib/utils`). The y-axis tick labels render the same branch but go through d3 `.text()`, and the legend entry is React — both already safe.

The calculator supports both fixed-sequence and Agentic Traces scenarios through
the shared `rowToSequence` classifier. Agentic rows carry null `isl`/`osl`, so
filtering them by numeric sequence lengths would silently drop every point.

Agentic interactivity follows the same definition as the main inference chart:

- P90 by default, with P75 selectable and shareable through `i_pctl`
- interactivity derived as `1 / ITL`, never trusted from a potentially stale
  artifact-supplied `*_intvty` field
- interpolation seeded only by points that also win on the selected
  percentile's end-to-end-latency Pareto frontier, preventing a configuration
  from winning the calculator by improving interactivity while degrading the
  full session
- official and unofficial-run agentic frontiers remain separate, just like
  their fixed-sequence counterparts

`b300Rows` in `cypress/support/overlay-fixtures.ts` covers the agentic calculator
path; `singleTurnRows` remains the fixture for fixed-sequence visibility and
sequence-switching behavior.

## Reciprocal Metrics Are Derived, Not Splined

`$/M tok` and `J/token` are a per-chip constant divided by a throughput
(`$/GPU-hr x 1e6 / (tok/s x 3600)`, `W / (tok/s)`). `interpolateForGPU`,
`maxInteractivityAtCost` and `interpolateMetricAtInteractivity` therefore spline
the **throughput** those metrics divide and re-derive the metric, rather than
splining the metric itself.

Independently splining the reciprocal metric and throughput creates two curves
that need not satisfy `metric x throughput = constant` between measured knots.
The direction and size of the difference depend on frontier density and can
change as benchmark runs land. Re-deriving the metric preserves its definition
at every interpolated point.

`/inference` plots these metrics only at measured points (`lib/chart-utils.ts`,
`roof: false`), where both methods agree exactly. Leave-one-out measurements can
compare interpolation models on a fixed snapshot, but they must not be presented
as permanent impact figures for the changing live dataset.

### The consistency guard

`recoverReciprocalNumerator` returns the constant only if **every** usable point
agrees on it within 0.1% (`1e-3` relative). That guard is what licenses the
rewrite. The `measured*` energy keys have a numerator measured per point rather
than a constant, so they are excluded from `RECIPROCAL_OF_THROUGHPUT` and still
splined directly. When the guard fails, all three call sites fall back to
splining.

The rate is recovered across **all three token types at once** (`recoverCostRate`).
Checking one family alone and falling back to another would recover a rate from
output tokens and then apply it to total throughput; the existing
`maxInteractivityAtCost` tests caught exactly that mistake.
