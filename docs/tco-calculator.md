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
