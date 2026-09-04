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

## Provider and State Ownership

The calculator route parses its URL seed on the server and mounts the sole
`GlobalFilterProvider` for calculator model, sequence, precision, date, and run state.
`DashboardShell` deliberately does not mount a second global provider on this route.

Calculator-specific visibility, target/input, metric, and selected-bar transitions are
owned by one local reducer. Derived ranges and valid selections are computed from current
data rather than copied back through reconciliation effects.

## Bar Selection & Comparison

Click-to-compare uses `resultKey` (not hwKey) because multi-precision mode produces multiple bars per GPU. Comparison ratios use the lower value as denominator (ratio >= 1.0). Both metric and token type are reflected in the comparison text to avoid ambiguity.

## Folding sections away (`CollapsibleSection`)

The page is long — chart, cost target, lifecycle — and most readers want one of them
at a time. The chart section and Interactivity Within a Cost Target each carry a
chevron toggle (`components/ui/collapsible-section.tsx`).

Two decisions in that component:

- **Folded means unmounted, not hidden.** These bodies hold D3 charts and tables, and
  leaving them mounted under `display: none` keeps them measuring and re-rendering
  off-screen for a reader who said they are not interested. The trade is that chart
  zoom and a frozen tooltip do not survive a fold.
- **`titleWhenOpen`.** The two fleet-planner sections own their `<h2>`, so the header
  shows the title always. The chart section's title lives in the chart's own caption
  (and is part of the PNG export), so its header shows the title **only while
  folded** — two copies would be worse than none. That is why `getChartTitle` is
  hoisted out of the caption in `ThroughputCalculatorDisplay`: the fold header needs
  the same words, and they carry the current metric and target.

State is local `useState`, not a URL param: it is a reading preference, not a view of
the data worth sharing in a link.

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

The calculator supports both fixed-sequence and Agentic scenarios through
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

The `/inference` page exposes infrastructure tokens-per-dollar and token revenue
as separate Y-axis metric families. Revenue selects the total-throughput Pareto
knots, interpolates throughput, token mix, and cache hit independently, and then
applies the selected token sale prices. Total, output-only, and input-only
infrastructure tokens-per-dollar trends spline their matching throughput and
apply the constant `3600 / $/GPU-hr` multiplier. Reusing the matching frontier
remains essential: total-throughput knots are not necessarily the output- or
input-throughput Pareto knots.

The revenue axis defaults to normalized cache-aware pricing: uncached input and
output are `$1/M tok`, while cached input is `$0.10/M tok`, matching Fleet
Lifecycle's default cache-read assumption. Its OpenRouter option fetches the
selected model's current public prompt/completion/cache-read prices from
`https://openrouter.ai/api/v1/models`; when the catalog omits a cache-read price,
the same 10%-of-input fallback is used and the resulting price is printed in the
plot subtitle. Aggregate rows use their measured input/output split.
Disaggregated rows cannot use the raw per-prefill/per-decode rates together, so
they apply the fixed ISL:OSL shape or the measured agentic prompt:generation mix
to total tok/s/GPU.

Agentic points use the same measured cache-tier rule as Fleet Lifecycle: GPU plus
external when the external metric is present, otherwise GPU plus CPU, clamped to
`[0,1]`. Missing cache telemetry bills the input stream at the uncached price.
Historical Trends uses the same component-wise calculation as Fleet Lifecycle:
it splines total throughput, input-token share, and measured cache hit separately
on the total-throughput frontier, clamps each to its measured range, and only then
applies the selected prices. A frontier with cache telemetry on only some knots
opts out of the cache discount instead of inventing zero-hit measurements.

Neither mode is the fleet lifecycle section's realized-revenue model: it does not
model availability or rollout, and its cached price comes from the selected price
source rather than Fleet Lifecycle's user-editable assumption. Those business
assumptions remain in Fleet Lifecycle below.

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

## Fleet Lifecycle (`FleetLifecycle.tsx`)

> **Now on its own page.** The section no longer renders on `/calculator`; it is
> the body of the `/fleet` route (and `/zh/fleet`), hosted by
> `FleetLifecycleDisplay.tsx`, which owns the same model/scenario/precision/
> cost-tier/target controls the calculator page does and renders the chip
> legend in its controls card, where it stays reachable from the table view and
> when nothing is plottable. The calculator keeps a pointer card linking to `/fleet`, and
> its cost-target panel now renders the MW budget input (`c_mw` is shared
> between the two pages, so a budget set on one seeds the other). Everything
> below about the section's internals still applies unchanged.

Everything above answers "which chip is cheapest at this interactivity, right
now?". This section answers "what has a fleet of it earned and cost since the
model shipped?" — and the answer is measured, not assumed.

### Why it absorbed Fleet Projection, and why the cost target moved instead

The page used to carry three fleet sections: **Fleet Projection** (a MW budget →
chips, fleet tok/s, concurrent users, $/hr, $/mo), **Interactivity Within a Cost
Target**, and this one. Two of those three are now one.

Fleet Projection was folded in here because it was half of this section already.
Its MW input was this section's _primary_ input — the empty state read "enter a
facility power budget in the Fleet Projection section above", which is a control
in one section gating a table in another. Its `Fleet $/hr` and `$/mo` are this
section's `Cost $/day` in other units, and its `Fleet tok/s` is `tok/s/MW now`
times the budget. What it had that this did not was the physical sizing: **chip
count** and **concurrent users**. Those are now columns, so the budget, the sizing
it produces and the economics that rest on it read across one row.

Two consequences worth knowing:

- **The MW input renders outside `body()`.** Every other control here only means
  something once a fleet exists, but this is the control that brings one into
  being, so it must be present in the empty state — otherwise the section
  deadlocks on its own precondition.
- **"Nothing to plot" needed splitting.** Fleet Projection had a dedicated message
  for a budget too small to power one chip. Falling back to this section's
  `noneMeasured` would have blamed the interactivity slider for a budget problem
  and sent the reader to the wrong control, so an unsizeable budget (`unplottable`
  non-empty with no rows) says so in its own words.

The cost target was **not** folded in, because it is not a slice of this section at
any point on the axis: it is the _inverse_ of the target-interactivity slider. The
slider fixes a speed and the cost falls out; the cost target fixes a cost ceiling
and the speed falls out. Nothing on a lifecycle answers "how fast can I go under
$0.50/M tok". So it moved rather than merged — out of the fleet-economics stack and
up to sit directly beneath the slider it inverts (`CostTargetPanel.tsx`), which is
also why it is deliberately independent of the slider's current value: it reads the
unfiltered frontier, so a chip that interpolates to nothing at the present target
still gets an answer.

### Why it reads the full run history

The rest of the calculator reads one run date, so a chip is credited with
whatever its latest sweep found. Measured against production history for dsr1
8k/1k (7,715 rows, 134 dates), roughly 37% of configs have their best read at a
typical target on an **earlier** date, worth up to ~3.6× — usually because a
later sweep explored a different part of the space rather than because the chip
got worse. For a lifecycle projection the honest number is the best config the
chip has ever demonstrated, so this section is the one place that reads
`/api/v1/benchmarks/history` instead of `/api/v1/benchmarks`.

### One line per chip, not per config

`hwKey` encodes the software, so a single piece of silicon appears in the history
many times over: `b200_trtllm`, `b200_sglang`, `b200_sglang_mtp` and so on are all
one B200. Drawing a line each says a fleet operator ran seven fleets, when they ran
one and kept re-deploying it onto whichever config was ahead. `mergeProgressionsByChip`
therefore collapses a chip's hwKeys into their **upper envelope**, and the winning
config becomes part of what each step reports (`Config Now` in the table, named per
rung in the tooltip).

Three consequences worth knowing:

- **Disagg competes for the same line.** Disaggregated configs report throughput
  per decode or prefill chip, so a step won by one is not sized on quite the same
  basis as a step won by an aggregated config; an earlier iteration split them into
  two lines for that reason. They are pooled by product decision — the operator's
  question is what the silicon can be made to do — so the caveat travels with the
  step instead: `ChipProgression.disagg` flags a chip whose progression involves
  any, the amber note explains the basis, and the config named on each step says
  which kind won it. Per-line dashing was dropped when this changed, because a
  single line can now contain both and a dashed stroke would assert something
  untrue of half of it.
- **The legend still filters hwKeys**, one level below the lines — hiding a config
  removes it from candidacy. Because the legend isolates on click, isolating a
  single config leaves at most one chip, and none at all when that config was never
  measured at the target. That is a real state, and `calculator-lifecycle.cy.ts`
  asserts it rather than assuming a row always survives.
- **Colour resolves from the winning hwKey**, not the base GPU. The palette is
  built over the _active_ hwKeys, so a bare base key falls through to the fallback
  grey — which silently drained the colour out of every series when first wired.

Cost stays flat across the merge because power and $/chip/hr come from the base
GPU: it is the same silicon whichever framework is in front.

`bestSoFarProgression` supplies the per-hwKey input: each hwKey's **running
maximum** over run dates — the sequence of dates whose
interpolated read at the target beat every date before it. That progression is
the section's subject. A sweep that failed to beat the incumbent is not a step,
because the fleet kept serving the config it already had, and the last rung of
the staircase is by construction the same all-time best the table reports
(`selectBestFromGroups` and `bestSoFarProgression` share one selection basis, so
the headline figure can never disagree with the plotted line).

That is only defensible with two rules, both in `historical-best.ts`:

- **Clamped reads are discarded, not clamped.** `interpolateForGPU` always
  returns a value, clamping the target into each frontier's measured range.
  Searching every date multiplies the chance of picking up such an edge read —
  at target 20 tok/s/user, 63% of naive winners are clamped, which would credit
  a sweep's peak throughput at an interactivity it never served. This section
  therefore applies the no-extrapolation rule (the same one
  `useInterpolatedTrendData` uses) and lists the hwKeys it consequently has no
  read for, with their measured ranges. Chips are never silently dropped: at a
  low or extreme target that empty list _is_ the finding.
- **Provenance travels with every number.** Each row renders its winning date
  and links its run, because the run date stamped above the chart no longer
  describes these numbers. A row whose winner beat the latest date is marked.
  There is no per-row trust annotation in the data — `PURGED_RUNS` is
  destructive so retracted runs cannot win, but a merely-superseded run can now
  win permanently — so the run link is the audit trail.

Precisions are pooled into one frontier per hwKey: the question is what the
chip's best config does, and precision is part of the config.

### Two-stage memoization

`groupHistoryByHwKeyAndDate` (rows → one sweep per hwKey per date) is separate
from `selectBestFromGroups` (read every frontier at the target) so moving the
interactivity slider re-reads without rebuilding ~790 frontiers, each of which
costs ten splines. For the same reason the hook computes **every** hwKey and the
component filters by `visibleHwKeys` for display — filtering in the data layer
would rebuild every frontier on each legend toggle.

### `view=calculator` on the history route

The history response is ~8.6 MB per model. `useHistoricalBest` gates the fetch
on a facility power budget being set, and requests `view=calculator` to trim it
to the calculator's metric allowlist (~24% smaller).

**That trim must stay opt-in.** `CALCULATOR_METRIC_KEYS` excludes the
measured-power metrics Historical Trends plots, so applying it to every history
response would silently blank those charts. `measured-power-overlay.cy.ts` is
the regression guard.

### Lifecycle math (`lifecycle.ts`)

Pure and React-free, like `fleet.ts`. It takes a `ThroughputStep[]` — one entry
per measured improvement — and turns it into a revenue staircase over calendar
time against a flat cost line:

```
revenue │              ,──── each config rolls out to its own numbers
        │         ,───╯
        │    ,───╯
────────┼──╱──────────────────────────────  cost: flat, the racks
        │ ╱ the first config rolls out from zero
        └──────────────────────────────────▶  months since model release
```

An earlier iteration modelled a TTFI delay, a ramp to a flat plateau and a
decommissioning taper, with no measured steps at all. That collapsed each chip's
optimisation history into a single number held constant for years, so every chip
drew the same assumed shape. The steps are measured; only the ramp survived, and
it survived as an explicit user assumption.

**A config is rolled out, not switched on.** So every config gets its own ramp:
when it lands, the fleet climbs from whatever it was already serving to that
config's numbers over `rampMonths`. The first config climbs from zero — nothing is
being served before it lands.

A rollout starts from the level the previous one **actually reached**, not from the
previous config's nominal rate. With a ramp longer than the gap between sweeps that
matters: the second config picks up mid-climb instead of jumping, so the line stays
continuous no matter how the ramp length and the sweep cadence interact.

Four conventions the numbers depend on:

- **Cost is flat, including through every rollout.** It is `chips × $/chip/hr`, and
  neither term moves when a config rolls out — racks bill from the moment they are
  energised, not from the moment they are loaded. So the opening rollout is paid for
  in full while it earns its way up from zero, which is what puts the first months
  below the rule and gives payback its meaning.
- **The ramp is an assumption; the steps are not.** It defaults to half a month
  (`c_ramp`) and moves in quarter-month increments; 0 means every config takes
  effect instantly.
- **Markers sit at the release instant** — the foot of each rollout, not its top —
  so every dot on the chart is a sweep the user can open.
- **Interrupts are an availability haircut, not drawn events.** A 24-day MTBI
  over a multi-year window is thousands of interruptions; at any sane chart width
  each is far under a pixel, so drawing them yields aliasing noise rather than
  information. They scale revenue via `mtbi / (mtbi + recovery)`.

A blank or zero MTBI means "no interruptions modelled", not "always down" — the
input is an optional refinement and a hostile default would be worse than none.

### Anchoring and the x axis

Time is measured from the model's release date, from `MODEL_RELEASE_DATES` in
`@semianalysisai/inferencex-constants` (DeepSeek-V4-Pro: 2026-04-24, confirmed
against `/api/v1/availability`, whose first `dsv4` row is that date). A model with
no release date on file falls back to its earliest measured run, and the caption
states which anchor is in use. A chip's line starts at its **own** first measured
run, not at the anchor: before that there is no data, so there is no line.

The horizon defaults to the measured window rather than a fixed number of months,
and stops re-seeding once the user edits it. A fixed 60-month default left ~80% of
the chart as flat tail extrapolated from the last sweep.

The time scale passes `nice: false`. `buildScale` niceing is on by default
(`scale-builders.ts:35`), which rounds a multi-year span out to whole years and
leaves dead space before the release date and after the horizon; both ends of this
domain are meaningful.

The zero rule is a `type:'custom'` layer, and it removes `.lifecycle-zero-rule`
before appending. The chart re-renders into the same zoom group, so appending
unconditionally leaves a stale rule and a duplicate "break-even" label behind at
the previous y-scale on every data change.

### Y-axis selector (margin / revenue / cumulative revenue)

`c_ly` switches the chart between margin/day (default), revenue/day, and cumulative
revenue. The table is unchanged — it already carries both rates and cumulative
margin — so this only affects the plot.

Three things move with it, and they all matter for honesty:

- **The break-even rule is drawn only for margin.** Zero is break-even on a margin
  axis; on a revenue axis it is just the bottom of the scale, and each chip breaks
  even at its **own** cost line rather than at zero revenue. Labelling the zero
  gridline "break-even" there would be false, so `renderZeroRule` returns early.
  Per-chip cost rules would be the honest equivalent but add one horizontal line
  per series, which is why they are not drawn. Cumulative revenue is the same case:
  a running total that starts at zero and only grows.
- **The readout's value column follows the plotted quantity**, with cumulative
  margin beside it, so it never depends on the axis to be read.
- **Cumulative revenue is accumulated, not derived.** `LifecyclePoint` carries a
  second running total, `cumulativeRevenue`, integrated by the same trapezoid over
  the same intervals as `cumulative` (cumulative margin). It is tempting to
  reconstruct it as `cumulative + costPerDay × elapsed`, and that identity holds
  only when every interval carries the same flat cost — which is true today but is
  a property of the assumptions, not of the shape. Accumulating both keeps the two
  curves exactly one flat cost apart by construction, which is what makes them
  comparable, and `isCumulative(metric)` is what the axis formatting and the
  break-even suppression key off rather than a per-metric special case.

Revenue mode is for comparing rollout _shapes_ across chips whose costs differ a
lot; a chip sitting higher there does not mean it is more profitable. Cumulative
revenue compounds that caveat — a chip with the largest area under its revenue
curve may still never have covered its cost. The control's tooltip says so.

### One line layer, interpolated linearly

Because every riser is now a sampled rollout curve and every plateau is flat, the
shape is already in the points: `curveLinear` draws exactly what was computed. A
step curve would flatten the rollouts back into stairs, and a spline would overshoot
on the near-vertical ones (a zero-length ramp emits two samples at the same month to
force a true vertical).

An intermediate version drew the ramp and the steps as two `line` layers with
different curves. **That does not work, and the reason is worth recording:**
`useD3ChartRenderer` renders every layer into one shared `renderGroup`, and
`renderLines` does a keyed join on `.line-path`. Two line layers with the same
series keys join against each other's paths, and the second silently overwrites the
first — one of the two segments just vanishes. Before adding a second layer of an
existing type to a `D3Chart`, remember that the shared render group makes layer keys
non-isolating; a `type:'custom'` layer with its own class is the way out.

### End-of-line chip labels

Each line is named by its chip at its right end, in the line's own colour, so a
series can be identified without crossing back to the sidebar legend. Two details
matter:

- The labels sit **past the plot width** (`x = width + 6`, with `CHART_MARGIN.right`
  widened to hold them), and `clipContent` defaults to true — layers render into a
  clipped zoom group, which would erase them entirely. They are drawn into
  `ctx.layout.g`, the unclipped parent, instead.
- End values cluster, so labels are placed by a greedy pass that pushes each label
  down to keep `LABEL_MIN_GAP`, then slides the whole block up if it has run off the
  bottom. A line ending at the very top or (after a zoom) outside the visible range
  is pinned to the nearest edge rather than allowed to escape the SVG.

Under an x zoom or pan, a line's last data point can sit well outside the plot, so
the label is placed at the value where the line **crosses the visible right edge**
(interpolated on the straddling segment), not at its final value. A line that ends
inside the plot is labelled at its own end instead, and one panned entirely out of
view is not labelled at all. Getting this wrong is not cosmetic: the two chips that
are still climbing at the horizon read several million dollars a day lower at a
zoomed-in edge than at their plateau.

Both the labels and the break-even rule are `type:'custom'` layers, and **both
declare `onZoom` as well as `render`**. A custom layer without `onZoom` stays pinned
to the base scales while the lines move, so a zoomed chart shows break-even — or a
chip's name — at the wrong height. This only matters because the chart passes
`zoom={{enabled: true, axes: 'x'}}`; it shipped for a while with the wrapper's
default caption promising shift+scroll zoom and no `zoom` prop at all, which made
both `onZoom` handlers dead code and the caption a lie. A Cypress test now asserts
the axis actually moves. Zoom is x-only on purpose: rescaling y would slide
break-even under the reader.

The custom layers read the current metric and line data through a **ref**, not
through the closure they were created in. The zoom behaviour installed by a render
captures that render's callbacks, and d3's double-click reset is a transition, so its
trailing events can fire after a later render has already redrawn — a stale callback
then re-appends what the new render removed. Switch to the revenue axis during a
reset animation and the break-even rule used to come back and stay, because nothing
renders again afterwards.

**Known limitation, in the shared renderer rather than here:** those same trailing
events also repaint the axes and grid from the scales captured when the transition
started, so changing the metric inside the ~750ms reset window leaves a stale y axis
until the next interaction. Fixing it means giving `useD3ChartRenderer` a
latest-context ref, which every zoomable chart shares; it is deliberately not done as
part of this section. The Cypress spec waits out the transition for this reason.

### The hover readout: one rule, every chip

Hovering anywhere in the plot draws a vertical rule and reads **every** plotted chip
at that instant into one popup; clicking freezes it, and clicking again releases it.
This replaced per-dot tooltips, which answered "what is this dot?" — the wrong
question for a chart whose lines are only interesting against each other. Comparing
two chips at one date meant hovering twice and holding the first number in your head.

It is built on `TooltipConfig`'s `proximityHover` + `getDataX`, so the shared
renderer's overlay rect owns hover for the plot area. Three consequences worth
knowing:

- **The hover positions are a uniform grid** (`HOVER_SLICE_COUNT` slices across the
  window), not the sample points. Sample density varies by two orders of magnitude
  along a line — 24 samples across each rollout ramp, one across a multi-month
  plateau — so snapping to samples makes the cursor crawl through a riser and then
  jump a year. Values come from linear interpolation between the bracketing samples,
  which is exactly what `curveLinear` draws, so the number always matches the pixel.
  A chip has no row before its own first measurement rather than a fabricated one.
- **Steps match by proximity, not equality** (`STEP_MATCH_SLICES`). A slice is a
  fraction of a pixel, so a step's instant essentially never coincides with one;
  matching exactly would make the run links unreachable by pointing at the dot,
  which is the only place a reader looks for them.
- **A step's config detail is frozen-only.** Hovering is for scanning, and the popup
  keeps one shape wherever the cursor is; a step block appearing as the cursor
  crosses a dot reflows the rows under the reader and buries the comparison they
  came for. A click means "tell me about this instant", which is where the config,
  its gain over the first run, and its run links belong.
- **The dots no longer own hover.** The overlay rect sits above them, so a Cypress
  test cannot click a `.dot-group` — it clicks the overlay at the dot's x instead.

Freeze is a toggle, which the shared overlay handler cannot express on its own: it
pins on every click, so a second click would just re-pin. A capture-phase listener on
the SVG records whether the readout was already frozen _before_ the pin lands, and
`onPointClick` dismisses when it was. Reading the pinned state afterwards would
always say "frozen".

Two testing notes, both about the portal tooltip rather than this chart. It is keyed
`data-chart-tooltip="<chartId>"` so a page with several charts can be asserted
per-chart. And `:visible` does not work on an **unfrozen** readout: Cypress treats a
fixed-position element as hidden when something else answers `elementFromPoint` at
its centre, and an unfrozen readout sets `pointer-events: none`, so the plot answers
instead. Assert `display` instead. Relatedly, any toast nudge re-renders the chart
tree and rewrites the portal's inline styles, wiping an open hover readout — app-wide
behaviour, which the spec sidesteps by suppressing the timed nudge.

Every rung links its run in the frozen readout, not just the opening and closing
sweeps the table links. Intermediate rungs are exactly where a superseded-but-never-
purged anomalous run would sit, so leaving them unlinked would have removed the audit
trail at the one place the trust argument depends on it.

The rule's group is `.lower()`ed on every draw. `renderLines` keeps its paths across
re-renders through a data join while this layer removes and re-appends, so without
that the dashed rule climbs above the lines after the first repaint.

### Known visual limitation: the palette is not colourblind-safe here

An adversarial review ran the series colours through a CVD validator and the result
is worth recording rather than hiding. With the default fleet the chart draws four
NVIDIA chips plus one AMD chip, which under the site-wide vendor convention
(`dynamic-colors.ts` gives NVIDIA the green hue zone and AMD the red one) means four
greens and a red. Seven of ten adjacent pairs fail: worst are MI355X↔B200 at ΔE 1.2
for protanopia — indistinguishable, and those two lines cross mid-plot — and
GB200↔GB300 at ΔE 7.7 for normal vision.

This is a property of the vendor convention every chart and legend shares, not of
this section, so it is deliberately **not** worked around locally: giving this one
chart its own palette would desync it from the sidebar legend and from every other
calculator chart. Two things are unavailable as local mitigations too — marker shape
already encodes _precision_ app-wide and there are only four shapes for five-plus
chips, and `POINT_SIZE` is a shared constant with no per-layer override, so the dots
cannot be enlarged to the 8px spec here alone. What the chart does carry is a
non-colour decoder: every line is named at its right end. Fixing the palette
properly means re-stepping the vendor zones in `dynamic-colors.ts` for all charts.

Related, and also left alone: the rollout ramps and the post-last-sweep hold are
assumptions drawn in the same stroke as the measured window, with only the step dots
marking measurements. The ramp input and the notes say so in words; distinguishing
them visually was considered and declined to keep one line per chip readable.

### Token price defaults to break-even

Break-even is per-chip, so a single global price input needs one anchor: the
**cheapest visible chip's** break-even, i.e. the competitive floor at which that
chip earns exactly nothing and everything pricier is underwater. It re-seeds when
the tier, token type or target changes, and stops the moment the user edits the
field (or arrives with `c_price` in the URL); a reset link restores it. The
figure comes from the TCO model — everything above that line is the user's
assumption, and the section says so.

It is derived as `costPerHour / fleetTokPerSec` for that fleet, so the plotted
margin is exactly zero at the default — for that chip, at its **latest** config.
Under the default price every other series therefore sits below the rule, and each
one's own earlier steps sit lower still. That is the competitive floor being read
correctly, not a scaling bug; raising the price lifts the whole fleet.

That is deliberately **not** the `$/M tok` the calculator's cost bars show for
the same config, and the reason is worth recording because it is a property of
the existing calculator rather than of this section.

`interpolateForGPU` splines every metric independently. Per point,
`cost = $/GPU-hr / (tput x 3600)` — cost is a **convex** function of throughput —
so splining the cost values directly lands above the curve implied by splining
throughput (Jensen), by a gap that widens with knot spacing. Measured over the
captured fixture across every frontier and every date:

| target sits…         | n   | median ratio | p95    | max     | share biased high |
| -------------------- | --- | ------------ | ------ | ------- | ----------------- |
| exactly on a knot    | 470 | 1.0000       | 1.0000 | 1.0000  | 0%                |
| midway between knots | 307 | 1.0568       | 3.9661 | 25.3237 | 73.6%             |

(ratio = splined `result.cost` / cost derived from the splined throughput.)

Agreement at every knot and one-sided divergence between them identifies this
as interpolation bias, not a modelling disagreement.

Scored against the oracle, the splined read is simply **less accurate**.
`/inference` plots cost only at measured points, as `specs.costh / tokensPerHour`
(`lib/chart-utils.ts:380`, `roof: false`). Holding out each interior frontier
knot in turn, rebuilding the frontier from the rest and predicting the held-out
point's real cost:

| method                          | mean err | p50   | p90    | p99     | closer to oracle |
| ------------------------------- | -------- | ----- | ------ | ------- | ---------------- |
| splined `result.cost`           | 162.8%   | 86.3% | 528.1% | 1402.1% | 36 / 144         |
| derived `k / interpolated tput` | 42.2%    | 23.0% | 72.0%  | 245.3%  | **108 / 144**    |

The structural argument is stronger still. That oracle construction makes
`cost x throughput = $/GPU-hr` an identity at every real point. Splining the two
independently breaks it: the calculator's pair violates it by a median 71.6% and
up to 2026%, i.e. it reports an operating point no real config could occupy.
Deriving cost from the interpolated throughput satisfies the identity by
construction.

This section therefore derives break-even from throughput, which also keeps it
consistent with the fleet planner directly above (fleet cost is
`gpus x $/GPU-hr`, a constant with no interpolation in it, so no other price can
zero the plotted margin).

**Follow-up worth taking.** The same defect affects the calculator's own cost
bars and table, not just this section: `interpolateForGPU` should build `cost`
from its interpolated throughput rather than splining the cost values. That is a
small change, but it lives in a Python-synced function (`iso_interactivity.py`)
and would move published cost numbers, so it needs its own change. Until then the
price tooltip states the direction of the divergence.

### Input and output are priced separately

Revenue is `input x inputPrice + output x outputPrice`, not one blended price
against one throughput. The two streams are wildly unequal and the split is
measured, not assumed — `input_tput_per_gpu` and `output_tput_per_gpu` are
already on every row, the same figures `/inference` plots:

| scenario       | input : output throughput                                                    |
| -------------- | ---------------------------------------------------------------------------- |
| fixed 8k/1k    | 8.0 : 1 (p10 7.9, p90 8.0 — it is the sequence shape, not per-config spread) |
| agentic traces | ~130 : 1 (p10 114, p90 145)                                                  |

At a 4x output premium on 8k/1k, output is a ninth of the tokens and a third of
the revenue, so a blended price is not a rounding difference. Three consequences:

- **Revenue no longer depends on the Input/Output/Total cost-type selector.** The
  fleet sells everything it produces; the selector still drives the cost matrix,
  the bar chart, and which config wins the staircase. This also retires a live
  trap — on `costType=output` the old model counted revenue from a ninth of the
  tokens while cost covered the whole rack.
- **Break-even is a line, not a point.** Any (input, output) pair on it zeroes the
  margin. The section resolves that by fixing the ratio currently in the two
  fields and solving the input price against `effectiveTokPerSec` —
  `billableInput + multiple x output` — so a reset scales both and lands back on
  the line at the ratio the user chose. Unseeded, the pair starts at 4x, which is
  roughly where the major vendors price (DeepSeek publishes $0.27 / $1.10).
- **Gain stays a token multiple.** `improvementFactor` counts both streams and no
  price, so it remains a statement about the hardware. The fixture that pins this
  grows the streams _disproportionately_ — input flat, output tripled — because a
  proportional one cannot tell "counted both" from "counted input only".

Cached input tokens are discounted into the input stream before pricing (see
below), so the input price is the fresh-token price.

`c_price` is the input price — unchanged, so a link written before the split
still seeds the field it always seeded — and `c_oprice` the output price. When a
legacy link has `c_price` alone, the missing output price is derived at the
default 4x ratio without overwriting the explicit input price; the symmetric
rule completes a manually authored output-only link.

### The disaggregated token-split trap

`input_tput_per_gpu` is per **prefill** chip, `output_tput_per_gpu` per **decode** chip,
and `tput_per_gpu` per chip **overall**. Three denominators. On an aggregated run they
coincide and the two rates sum to the total on all 937 production rows. On a
disaggregated run they do not, and the gap is large: across 308 disagg rows the two
rates sum to between 1.00× and **16.11×** the total, tracking
`(prefill + decode) × (isl/prefill + osl/decode) / (isl + osl)` to four decimals.

Pricing the two streams off those rates therefore billed a disaggregated config for
tokens its chips never served. The visible symptom was a **dip**: MI355X on
DeepSeek-V4-Pro 8k/1k stepped from `mori-sglang` (disaggregated, 2026-07-22) to
`atom_mtp` (aggregated, 2026-07-28) with a _higher_ total tok/s/MW — a legitimate
best-so-far rung — and the margin line fell, because the outgoing config had been
credited with ~2× its tokens. Eleven such dips existed across 215 step transitions on
eight interactivity targets; every one was a handover where the prefill:decode split
changed or disappeared.

`tput_per_gpu` itself is **not** affected: it is per chip overall for both kinds, which
reproduces exactly from the absolute rates and the chip counts — on the first disagg row
in production, `(54.521×8 + 6.857×8) / 16 = 30.68886 = tput_per_gpu` to five decimals.
So the ranking, the sizing and the cost line were always comparable across an
aggregated→disaggregated handover; it was only the two per-stream rates that were not.
The section's disagg note used to claim otherwise and has been corrected.

One place had the same defect and is fixed alongside: **concurrent users**, which divided
the per-_decode_-chip output rate into a whole-fleet chip count and so overstated the
stream count by `(prefill + decode) / decode` — median 2×, up to 7× in production history.
It now uses `outputTokPerChip`, which re-bases onto chips overall and is a bit-for-bit
no-op wherever no share is known.

What remains an assumption rather than a measurement: the winning config's prefill:decode
ratio is taken to apply across the whole fleet from the moment it rolls out. A switch from
aggregated to disaggregated serving is a redeployment, and the ramp window is what stands
in for it. Chip counts also will not generally divide into the config's ratio, a remainder
bounded by one config-unit that the model ignores.

The fix is to use a **share of the per-chip total** wherever a token-type figure is
needed, never the two rates directly, with the share recovered as:

1. `input / (input + output)` when those agree with `tput_per_gpu` to within 1% — every
   aggregated row, where the measurement is self-consistent and is the truth;
2. otherwise `isl / (isl + osl)` — for a fixed sequence the mix is the sequence shape,
   and no config can change it;
3. otherwise the run's own `total_prompt_tokens : total_generation_tokens` — agentic
   traces, which have no ISL/OSL;
4. otherwise nothing is charged as input, which understates revenue rather than
   inventing a mix.

After the fix: 0 dips across the same 215 transitions, and the streams sum to the rate
the fleet was sized and costed on by construction.

**Selection needed the same correction, and it is a second bug.** Fixing revenue alone
left the _ranking_ — which config wins each step — reading `inputTpPerMw` /
`outputTpPerMw` raw, so a disaggregated config could win a rung purely for having been
divided by fewer chips. Measured across seven interactivity targets: on total pricing the
basis makes no difference (46 of 46 chip-winners identical, confirming `tput_per_gpu` is
genuinely per total chip), but on **output** pricing 10 of 46 winners change and 5 are
handed to a disagg config a comparable basis rejects; on **input**, 17 of 46 change.
`mi355x_mooncake-atom@2026-06-12` won the output ranking at 25 and 30 tok/s/user on the
raw basis; on a comparable one `mi355x_atom_mtp@2026-07-28` wins.

So `getComparableTpPerMwForType` splits `tpPerMw` by the same share, and the
lifecycle selection (`useHistoricalBest`) uses it.
For an aggregated config it is an exact identity — the rates already sum to the total, so
`tpPerMw × share` _is_ `inputTpPerMw` — so only disaggregated rows move.

The bar chart and cost matrix above still show the raw per-prefill / per-decode figures
with their existing disclaimer, deliberately: a chart the reader is told how to interpret
can carry a footnote, and changing the headline chart's numbers is a separate decision.
What is no longer acceptable is a _ranking_ that silently picks a winner on that basis. A corollary worth stating: on a fixed
sequence the input/output split changes the **level** and the break-even price, but it
cannot reorder chips, because the mix is the same for all of them. On agentic traces the
mix is measured per config, so there it can.

### Margin and revenue per megawatt

Two y-axis metrics normalize the daily rates by provisioned power:
`marginPerMw` (`c_ly=marginPerMw`) plots `revenue − TCO` in `$/MW/day`, while
`revenuePerMw` (`c_ly=revenuePerMw`) plots revenue before TCO in the same unit.
Two things about them are worth being explicit, because a reader could reasonably
expect more than they deliver:

- **They re-rank almost nothing.** Every chip in this section is sized to the same
  power budget, so each per-MW rate is its unnormalized rate divided by very nearly
  the same number for every series. The only spread comes from how completely each
  chip's power density fills the budget. What the metrics buy is a figure that does
  not move when the budget does — the unit a power-constrained plan is written in —
  not a new ordering.
- **The denominator is provisioned power, not the budget.** `chips × kW/chip ÷ 1000`,
  because chip counts are whole and the remainder of the budget is stranded. Using
  the typed budget would credit each chip with power it never provisioned. An
  unusable figure (no registered power, a budget too small for one chip) leaves the
  metrics at zero rather than dividing by it.

Because the rescale is by a positive constant, zero on `marginPerMw` is still
break-even. That is why `isBreakEvenAnchored` includes it and the chart retains
the dashed rule. `revenuePerMw`, like unnormalized revenue, does not draw the
rule: zero revenue is not break-even for a fleet with non-zero cost.

### Agentic traces, and cached input tokens

The section refused Agentic Traces until it was shown that the refusal's stated
reason — "run history is keyed by input/output sequence length" — was no longer
true. `/api/v1/benchmarks/history` takes `benchmarkType=agentic_traces` and drops
the ISL/OSL filter server-side; `buildGpuGroups` already maps agentic rows and
already takes a percentile. Only the fetch in `useHistoricalBest` had to change.

What did need real work is the revenue term. Measured against production history
(`inferencex.semianalysis.com`, DeepSeek-V4-Pro and GLM-5.2, August 2026):

|                                  | agentic                        | fixed 8k/1k                    |
| -------------------------------- | ------------------------------ | ------------------------------ |
| median input:output token ratio  | **133:1**                      | ~8:1                           |
| median GPU prefix-cache hit rate | **0.92** (min 0.005, p90 0.96) | metric **absent on every row** |
| rows carrying a hit rate         | 217/223 DSV4, 45/45 GLM-5.2    | 0/1245, 0/541                  |

Charging the input price against the raw input rate therefore bills ~13.5k tok/s
of which ~92% are cache _reads_, which providers charge a fraction of the fresh
input rate for — overstating agentic margin by close to an order of magnitude. At
8:1 with no prefix reuse the distinction is immaterial; at 133:1 with 92% hits it
is the dominant term.

So the fleet is sized on the physical rate and the **input stream is discounted
before it is priced**:

```
billableInputTokPerSec = inputTput × (1 − clamp01(cacheHitRate) × (1 − cacheReadRatio))
```

Selling `hit` of the stream at `ratio` of the price is exactly the same revenue as
selling `hit × ratio` of it at full price, which is why one factor on the rate
does the whole job and the input price stays the fresh-token price.

Three properties are worth stating, because they are what make this safe:

- **It is a subtraction, not a recomposition.** Writing it as
  `output + billableInput` would re-derive the total from two independently
  splined series and drift against it. As a subtraction the result is _exactly_
  `base` whenever there is nothing to discount.
- **Fixed sequences are unaffected by construction.** They carry no cache metric
  on any row, so `cacheHitRate` is `undefined` and the term is zero — not "close
  to zero", identical. That is asserted with `toBe`, not `toBeCloseTo`.
- **A partly-measured frontier opts out.** `interpolateForGPU` splines the rate
  only when _every_ frontier point carries one; substituting 0 for the missing
  points would invent a dip in the cached fraction and overstate the billable
  rate. Opting out bills every input token at full price instead, which
  overstates revenue and margin when the missing point actually had cache hits.

`cacheReadRatio` is the one user input here, labelled `Cached input (% of price)`
and defaulting to 10% (the ratio DeepSeek and Anthropic both publish). The cached
_fraction_ it multiplies is measured per config, not assumed. The control is
hidden for fixed sequences rather than shown as a no-op. There is no circularity
with the break-even seed: billable throughput depends only on the ratio, and
break-even then solves the price given that throughput.

**What counts as cached.** Three tiers are reported and they do not all stack, so
the rule is conditional rather than a sum. Measured across 326 production agentic
rows, each checked against its own `theoretical_cache_hit_rate` ceiling:

| row shape                    | rows | `gpu+ext` > ceiling | `gpu+ext+cpu` > ceiling |
| ---------------------------- | ---- | ------------------- | ----------------------- |
| external absent, CPU absent  | 92   | 8                   | 8                       |
| external absent, **CPU > 0** | 26   | 0                   | **0**                   |
| external > 0, CPU > 0        | 106  | 1                   | **56**                  |
| external 0, CPU 0            | 96   | 0                   | 0                       |

The middle two rows carry the decision. Where an external rate is reported,
adding CPU on top breaches the ceiling 56 times out of 106 — the router-side
external figure already contains the offload tier, so summing double-counts it.
Where no external rate is reported the CPU tier is real and disjoint: 0 breaches
across all 26, every one of them an offload-on row. Hence `measuredCacheHitRate` adds
external when present and CPU only in its absence.

Dropping the CPU tier outright, which this did until 2026-08-19, understated the
cached share on those 26 rows by a median 5.54pp (p90 39.7pp, max 76.9pp — the
median CPU rate is 0.055 but the tail is long). An understated cached share bills
more input at the fresh price, so it **overstates** revenue: on those rows the
input revenue leg was too high by a median 27%, p90 67%. That is the opposite
direction from the all-or-nothing rule below, which deliberately errs
conservative, and the reason this was worth a branch. Fleet-wide the median hit
rate moves only 0.9255 → 0.9279, because 294 of 320 rows are unaffected.

Two honest caveats on the rule. A reported external `0` is treated as a
measurement that suppresses CPU rather than as an absence, on the reasoning that a
router reporting zero external hits has still accounted for the offload tier —
but **no production row currently has external `0` alongside a non-zero CPU rate**,
so that branch is a deliberate choice about an unobserved shape, covered by a test
rather than by data. Separately, `gpu` alone already breaches the ceiling on 8
rows that report neither of the other tiers; that is a data-quality question about
those rows, partly masked by the `[0,1]` clamp, and this rule neither causes nor
fixes it.

The clamp to `[0,1]` is not decorative — the GPU figure alone reaches 1.185 on
rows without an external one.

**Interpolating the cached fraction is safe, and this is the evidence.** The rate
is splined along the frontier like any other metric, which raises the fair
objection that two adjacent frontier points can describe different serving
regimes. Measured by leave-one-out over 141 interior points of 26 production
frontiers — drop the point, read its interactivity from its neighbours, compare to
what was measured there:

| metric                                 | median | p90    | max     |
| -------------------------------------- | ------ | ------ | ------- |
| cache hit rate, absolute error         | 0.0076 | 0.0631 | 0.4890  |
| throughput, relative error _(control)_ | 8.60%  | 34.85% | 245.79% |

At the median the hit rate is off by 0.8% relative, against 8.6% for the
throughput the whole calculator already rests on — so the cached fraction is about
an order of magnitude better behaved than the number nobody questions. Adjacent
frontier points differ by under one percentage point at the median (p90 0.079,
max 0.510). The wide 0.005–0.96 spread quoted above is across _all_ of a chip's
configs, not along a single Pareto frontier, which is what the spline walks.

**A limitation the UI discloses.** Agentic run history is roughly a week deep:
DSV4 has 7 run dates with 4 of 19 configs measured on more than one; GLM-5.2 has
4 dates and **0 of 9** configs on more than one. Fixed 8k/1k has 61 dates over
3.7 months with 30 of 45 configs on several. Since this section plots a
best-so-far staircase, agentic lines are often a single rung. When no visible
chip has two, the section says so — a flat line here is a gap in the history, not
a finding about the hardware. This resolves itself as runs accumulate.

### Overlay exemption

This section is official-only, and unlike the fleet planner that is not a policy
choice: unofficial runs are not ingested, so `/api/v1/benchmarks/history` cannot
serve them. Taking AGENTS.md's documented exemption; the section states the
exclusion in its own note rather than leaving a silent gap.

### What is still not apples-to-apples, and why it was left alone

The bar chart and the cost matrix still show
`input_tput_per_gpu` / `output_tput_per_gpu` on their reported per-prefill / per-decode
basis, and their `$/M tok` with them. On the Input and Output token types a disaggregated
config therefore reads **faster per chip and cheaper per token than it is** — a median 2×,
up to 18× on input and 7× on output across run history. Total-token figures are unaffected.

That was a deliberate decision not to move published numbers, taken after establishing
that the two cannot be fixed independently: **per-token-type cost is not stored data.**
`interpolateForGPU` recovers the constant `$/chip-hr × 1e6/3600` from the points and
re-derives cost as `rate ÷ throughput` — verified on all 37 disaggregated sweeps in the
fixture, where the rate is recovered every time and `cost × throughput` holds to 1e-6 on
the interpolated result for all three token types. So:

- re-basing the point's `costhi` has no effect, because `costInput` is recomputed from
  `inputTputValue` downstream;
- re-basing the divisor instead would break the identity `recoverReciprocalNumerator`
  licenses, which `maxInteractivityAtCost` depends on — the cost-cap card would answer
  against a different cost curve than the bars, the one thing its comment says must never
  happen;
- and dividing the displayed `$/chip-hr` by the displayed throughput would stop giving the
  displayed cost, for disaggregated rows only.

Fixing cost alone is therefore not available. The choice is all of it or none of it, and
the notes now carry the correction instead: which figures are affected (Input and Output,
never Total), in which direction (flattering), by how much, and that the Fleet Lifecycle
section next to them is deliberately on a different basis.

### Chart and table are tabs, with the figure's own header

The section renders as a `<figure>` in the same shape as the bar chart above it and
the `/inference` charts: a `ChartButtons` row carrying a Chart/Table `SegmentedToggle`
and the PNG/CSV export menu, and a caption with the title plus the provenance a reader
needs — model, scenario, target interactivity, power budget, source. The caption is
passed to the chart as its `caption` and rendered as a `<figcaption>` in the table view,
so switching tabs never loses the heading.

PNG export is disabled on the table tab: a picture of a paginated HTML table is not an
artefact anyone wants. The CSV is the export for that view, and it carries the
assumptions in its notes preamble — a CSV read six months later cannot be reconstructed
from the rows alone.

The table's search box is off (`searchable={false}` on `DataTable`). It is one row per
chip, and every chip is already named in the legend and on the chart; a search field
over five rows is furniture. The prop is new and defaults to true, so no other table
changed.

### URL params

`c_price`, `c_life` (horizon), `c_ramp`, `c_cache` (cached-input price, % — agentic
only), `c_mtbi`, `c_rec`, `c_ly` (y-axis metric —
`margin` | `marginPerMw` | `revenue` | `revenuePerMw` | `cumulativeRevenue`, parsed
against that allowlist so a stale or hand-edited link falls back to `margin` rather
than seeding an unknown metric).
The first two default to
`''` in `PARAM_DEFAULTS` because their real defaults are derived, not constant — see
the comment there. The MW budget is `c_mw`, defaults to 10 MW, and is shared by
the calculator and Fleet Lifecycle page so a budget set on either seeds the
other.

## Profit Estimator (`/profit-estimator`, `/profit-estimator-per-gigawatt`)

> Both hosted by `ProfitEstimatorDisplay.tsx` with the math in `profit-estimator.ts` and
> the bars in `ProfitEstimatorChart.tsx`; the page passes `basis="chip-hour"` or
> `basis="gw-year"`. Mirrored at `/zh/profit-estimator` and
> `/zh/profit-estimator-per-gigawatt`. Per-model routes live at `/<tab>/<slug>` (and
> `/zh/...`), see below.

Fleet Lifecycle answers "what did a fixed fleet earn over its life". These two tabs
answer a narrower, present-tense question: at one interactivity operating point, what
does each chip earn today, and who keeps it? One vertical stacked bar per SKU. The two
tabs differ only in the denominator (`ProfitBasis`):

- **Profit Estimator** (`/profit-estimator`, `chip-hour`): one GPU for one hour. The
  bar is the $/GPU/hr the chip sells for at that interactivity; compute expense is the
  TCO tier's $/chip/hr as published. Figures are dollars and cents (`$2.31`). The y
  axis reads "Revenue per chip per hour ($ USD)".
- **Profit Estimator per GW** (`/profit-estimator-per-gigawatt`, `gw-year`): the same
  per-chip figures multiplied by the GPU-hours one all-in utility gigawatt-year buys
  for that SKU, so chips with very different power draw compare on the same
  denominator. Figures are compact (`$135.2B`). The y axis reads "Revenue per all-in
  provisioned utility GW per year ($ USD)" (a shorter form on phones).

In the nav both sit between Inference Performance and Accuracy Evals. TCO
Calculator and Fleet Lifecycle moved out of the tab bar into the footer's "More" column
(`navGroup: 'footer-only'`, `footer-link-calculator` / `footer-link-fleet`); their
pages, `/zh` mirrors and sitemap entries are unchanged.

### The arithmetic

```
gpuHours    = 1                                          # chip-hour basis
gpuHours    = (1,000,000 kW ÷ all-in kW per GPU) × 8,760 h   # gw-year basis
revenue     = $/GPU/hr(sale) × gpuHours × utilization
tco         = $/GPU/hr(cost) × gpuHours
grossMargin = revenue − tco
licenseFee  = revenue × licenseFeePct       # `labCut` in code
profit      = revenue − tco − licenseFee
```

`formatProfitUsd(value, basis)` picks the formatter: two fixed decimals per chip-hour,
`formatUsdCompact` per GW-year. A SKU with no power figure is skipped (`no-power`) on
the GW-year basis only; per chip-hour power never enters.

`$/GPU/hr(sale)` comes from `tokenRevenueFromRatesPerGpuHour`, so it reuses the
calculator's input/cached/output token split and the OpenRouter catalog price (or a
custom price pair). `$/GPU/hr(cost)` is the selected TCO tier from `getGpuSpecs`, or,
with the **Custom $/GPU/hr** provider, one number per base chip typed by the reader
(seeded from the hyperscaler tier; an empty box drops that chip as "no cost"), and
the power figure is the same all-in kW per GPU that `tok/s/MW` uses. This is the same
GW-year normalization as the Revenue/Profit-per-GW y-metrics on the calculator; the
helper lives in its own module for now so this page does not depend on that branch,
and the two can be collapsed into one once both are on master.

### Decisions worth knowing

- **Utilization scales revenue only.** 60% means the fleet bills 60% of the tokens
  the benchmark says it could produce. Chips are paid for whether or not they are
  busy, so TCO is untouched. The haircut is not drawn as its own segment; the bar
  simply tops out at realized revenue, and the caption states the rate.
- **The model license fee is a share of revenue, not of gross margin.** It is a
  royalty on every token sold, so it is owed even when compute alone already exceeds
  revenue. The UI calls it "Model License Fee (%)"; code and test ids keep the older
  `labCut` name. A loss bar is TCO and license fee above the axis and the shortfall below it, hatched
  in the SKU colour. The tooltip still shows gross margin (revenue minus TCO) so
  the two deductions can be read separately.
- **Every segment is labelled in place.** Name and dollar amount sit inside each
  rectangle when it is tall enough, amount only when it is shorter, nothing when
  it would not fit. Revenue and margin (profit ÷ revenue) sit above the bar, with
  the vendor's full-color mark above those.
- **Out-of-range reads are excluded, not clamped.** A config the target
  interactivity falls outside of (H200 on Kimi K3 at 45 tok/s/user, say) is not
  drawn and not offered in the legend. This matches the fleet page, which drops
  those points rather than showing an edge value that was never measured.
- **Agentic traces only.** The page pins the sequence to agentic traces, so there is
  no scenario selector and no precision selector (precision stays in auto mode, the
  densest measured run set). The interactivity target is a typed number in the same
  row as utilization and the license fee.
- **Kimi K3 only, for now.** The model selector offers the tab's route allow-list
  (`MODEL_ROUTE_TAB_MODELS['profit-estimator']` and
  `['profit-estimator-per-gigawatt']` in `model-routes.ts`) intersected with the
  models that have an agentic run. Each bare path opens on Kimi K3
  (`defaultRouteModel(tab)`); `/profit-estimator/kimi-k3` and
  `/profit-estimator-per-gigawatt/kimi-k3` are the same pages, aliases 308 to the
  canonical slug, and any model outside the allow-list 404s. Widening the pages to
  more models is one list edit plus fixture rows.
- **Two-line x labels when they fit, slanted when they do not.** `xLabelLayout`
  estimates the widest label against the room per tick. With room, each SKU stands
  upright as two lines, name over framework and precision (`splitAxisLabel`), and
  the bottom margin shrinks to match. Otherwise the label rotates -50° as one line
  and `slantedMargins` grows the left and bottom margins so nothing leaves the SVG.
- **Vendor mark above each bar, not on the axis.** The full-color logo
  (`getAxisVendorIcon`) sits above the revenue figure and margin line. NVIDIA's mark
  is the brand green and is never inverted; AMD publishes no color mark, so its arrow
  is black and inverts to white in dark mode. The mark scales with the bar:
  `barMarkHeight(bandwidth)` is 22% of the band width clamped to 14–40px, so desktop
  bars get a large logo and phone bars the small one. The y domain leaves exactly
  `stackHeadroomPx(markHeight)` above the tallest stack for those labels
  (`profitYDomain` takes the plot height and that headroom), and the top margin is
  12px, so the grid starts right under the selling-price line.
- **TCO badges track the legend.** The `TCO $/chip/hr:` line lists one badge per base
  chip whose bar is currently drawn; isolating a SKU in the legend leaves only its badge.
- **Cost provider names match `/inference`.** The selector reuses `COST_TIER_LABELS[...].option`
  (Owning - Hyperscaler, Owning - Neocloud Giant, 3 Year Rental) plus Custom $/GPU/hr.
- **Chart height follows the viewport.** `chartHeightForViewport(window.innerHeight)` is
  the full 720px only when the window has room; otherwise it is the viewport minus
  `CHART_VIEWPORT_RESERVE` (260px: sticky nav, card header, padding), never below
  `CHART_HEIGHT_MIN` (440px). On an 872px laptop viewport the chart is 612px, so the card
  title and the x labels fit on one screen. The compact chart caps at 560px the same way.
- **Phone layout.** Below 640px the chart switches to compact margins and height, and
  segment labels drop the name, then the amount, when the bar is too narrow
  (`segmentLabelLines` with a width); the margin line keeps only the percentage.
  Custom token prices always take their own row under the main controls.
- **Legend is the SKU filter.** Same click semantics as the fleet page (click to
  isolate, click again to restore), and the same `resolveCalculatorVisibility`
  intent so the choice survives a model change when the SKU still exists.
- **Unpriceable SKUs are dropped.** A SKU with no power figure, no TCO for the
  chosen tier, or no recorded input/output mix is left out of the chart and the
  legend; the legend is the record of what is priced.
- **The heading reads like `/inference`.** Model, workload, and target in the title;
  cost tier, utilization, model license fee, run date, and source beneath it; TCO $/chip/hr badges and
  the selling prices under that. The TCO source line is omitted when the cost
  provider is a custom $/GPU/hr, since there is nothing to cite. Segments are
  labelled in place, so there is no separate key and no hover hint under the chart.
  The formula sits in a fold under the chart ("Revenue per GigaWatt Formula"),
  collapsed by default, and the export button (top right of the card) writes PNG
  and CSV.
- **Number inputs ignore the mouse wheel.** A wheel event over a focused number
  input blurs it, so scrolling the page never nudges a percentage.

### Fixtures

The captured API fixtures carry no `agentic_traces` rows, so the Cypress spec
(`cypress/e2e/profit-estimator.cy.ts`) intercepts availability and benchmarks with
synthetic Kimi K3 curves from `cypress/support/profit-fixtures.ts`. The H200 curve
stops below 45 tok/s/user on purpose so the exclusion path stays covered.
