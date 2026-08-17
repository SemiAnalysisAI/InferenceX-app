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

## Folding sections away (`CollapsibleSection`)

The page is long — chart, fleet projection, cost target, lifecycle — and most readers
want one of them at a time. The chart section, Fleet Projection and Interactivity
Within a Cost Target each carry a chevron toggle (`components/ui/collapsible-section.tsx`).

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

The `/inference` page also exposes tokens-per-dollar as separate Y-axis metrics;
it does not replace the cost-per-million metrics. Historical trends for these
purchasing-power metrics select Pareto knots from the matching total, output, or
input throughput, spline that throughput, and apply the constant
`3600 / $/GPU-hr` multiplier. Reusing the matching throughput frontier is
essential: total-throughput knots are not necessarily the output- or
input-throughput Pareto knots.

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

Everything above answers "which chip is cheapest at this interactivity, right
now?". This section answers "what has a fleet of it earned and cost since the
model shipped?" — and the answer is measured, not assumed.

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
- **The ramp is an assumption; the steps are not.** It defaults to a nominal
  quarter (`c_ramp`), and 0 means every config takes effect instantly.
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

### Interactivity Surface (the 3D view)

A folded section under the 2D chart plots the same fleets with **interactivity as a
third axis**: x = time, y = the 2D chart's selected metric in $/day, z = interactivity,
one shaded surface per chip, rotatable (`FleetLifecycleSurface.tsx` + `surface/`, data
in `interactivity-surface.ts`).

It answers: **the fleet I would deploy for my target, what does it earn if users turn
out to want faster or slower tokens than I planned for?**

🔴 The rule that shapes everything: **a fleet runs one config at a time.** The rungs
are chosen once, at the calculator's target, by exactly the 1D pipeline
(`stepsAtInteractivity` at `currentZ`) — so the slice at the slider _is_ the 2D
chart's line — and every other slice re-reads **those same sweeps** at its own
interactivity. A date has one config across the whole z axis, because that is what a
deployed fleet has.

The tempting alternative is to re-derive the best-so-far staircase per slice. It draws
something no operator can buy: at one instant, the fleet running config A for users who
want 20 tok/s/user and config B for users who want 120 — two fleets. It also puts step
changes along z wherever the winner flips, and those cliffs read as economics when they
are really the boundary of where a sweep happens to have been run.

Fixing the winner is only half of it, and the other half is easy to miss. A rung whose
sweep was never measured at some slice cannot contribute there — and if that date's cell
then falls back to the config it replaced, the timeline changes with z again and the
same bug is back one level down. It shows up as a **rippling** surface. So a date whose
config is unmeasured at a slice is a **hole**, never the previous config. (Rollouts need
one extra guard: a ramp climbs from whatever the fleet was serving before, so if the
previous config is unmeasured at that slice the ramp — and only the ramp — is unknown
too. `contaminatedRungs` computes that, including chains through rollouts that were
themselves still climbing.)

That is what makes the surface monotone in z **under total-token pricing**, and
monotonicity is the check worth running there: at a fixed date the value is one config's
frontier read, or two blended by a ramp whose weights depend on the date alone, so it
can only fall as users demand faster tokens. Measured over the shipped fixture at four
targets with total-token pricing — ~33k live cells — the current code has **zero**
violations; the fallback version had 79–132 per target, with jumps up to 440×. At
input-token pricing the same grids legitimately contain rises (below), so monotonicity
is a valid regression check for `costType: 'total'` only.

The cost of the honest rule has to be stated in the UI, and is: **away from the target,
the surface is not the best that chip could do.** A config picked for 35 tok/s/user may
be beaten at 120 by one the fleet passed over. The caption says so. It also costs
coverage — about 12% of cells on the fixture become holes — which is the right trade:
those cells were previously showing a config the fleet had already replaced.

**Which way does the surface tilt along z?** For total-token pricing, down — and that is
a theorem, not a measurement: chip count is fixed by the power budget and price is one
scalar, so revenue tracks tok/s/chip, and for total tokens that number is the Pareto
frontier's own y axis, which `paretoFrontUpperLeft` constructs strictly decreasing in
interactivity. The fixture agrees because it must: across the shipped fixture's 197
sweeps (1k/1k, fp8 + fp4), tok/s/chip falls across the frontier's own range in all 160
multi-point frontiers and is flat in the 37 single-point ones.

For input- and output-token pricing the guarantee does not exist. Those throughput reads
are not the axis the frontier is built on (`tputOf` returns `inputThroughput` /
`outputThroughput`, while the frontier is built on total), and on disaggregated sweeps
the prefill:decode mix shifts along the frontier, so input tok/s/chip can rise as
interactivity rises. On the same fixture, 12 sweeps rise on input throughput inside
their range (worst: `mi355x_mori-sglang`, 8k/1k, 2026-05-28, +1.4× mid-range — its total
falls 47× over the same range, which is the figure that used to be quoted here), one rises
end to end (`b300_dynamo-trt`, 1k/1k, 2026-02-07: 6,710 → 8,818 tok/s/chip), and grids
built at input pricing carry z-rises of up to ~4% per slice step. This is reachable in
the shipped product — the Token Type dropdown feeds the surface directly, though it is
not a URL param, so a shared link always reopens at total. Such a rise is measured data,
not a config leaking across slices: the one-config-per-date rule still holds; it is the
priced token mix that moves.

**A running total cannot span a hole.** The rate metrics resume after a gap, correctly:
a rate at a given date depends only on the config governing then. A running total does
not — it contains every interval before it, and where a rung the fleet actually ran is
missing from a slice's timeline, `computeLifecycle` integrates that window at the
previous config's rate, which the staircase says was slower. On a 12-month window with
one 3-month hole that understates the total by ≥ $1.72B, ≥ 7.7%, in every later cell,
with nothing on screen to say so. So a cumulative row ends at its first gap, and a slice
missing its _first_ rung shows nothing at all — otherwise the totals compared along z
would cover different windows (9.88 months against 11.80 on the test fixture), which is
not a comparison. Rates are deliberately left alone.

Holding the config fixed is what lets that read cleanly, and is the strongest argument
for the rule. With a per-slice winner the same fixture jumps 5,009 → 14,275 tok/s
between the 15.1 and 18.5 tok/s/user slices — not because the economics turn, but
because below 18.5 the 2.85×-better `b300_dynamo-trt_mtp@2026-01-28` was never swept and
a weaker config inherits the slice. Fixing the rungs turns that artefact back into what
it always was: a hole. The unit tests pin exactly this, and the previous implementation
fails all three.

Five decisions that are easy to get wrong, and why:

- **Slices are never interpolated into one another.** A rung exists on a slice only
  where its own sweep was measured, so blending adjacent slices would invent risers on
  dates nothing was measured. Every slice is evaluated independently and sampled onto
  one shared time grid; z is the axis you read across, not one you interpolate along.
- **Holes are drawn as holes.** Reads outside a run's measured range are excluded, not
  clamped, so coverage is banded: measured on the shipped fixture, the fraction of
  sweeps covering a given interactivity peaks near 65% and falls to ~2% at both ends
  of the axis, and 37 of 197 sweeps have single-point frontiers that can never
  contribute. `buildSurfaceGeometry` indexes a quad only when all four corners carry a
  value, so gaps terminate the mesh instead of bridging it — and the caption says so.
- **One price for the whole surface.** Re-seeding break-even per slice would zero the
  margin along every slice at once, flattening the crossing into a plane and
  destroying the cross-slice comparison. The section's own price applies unchanged, so
  the zero contour is a real answer: where this fleet, at the price you set, stops
  losing money.
- **The y axis is the 2D chart's selector, not a second control.** `SurfaceGrid` carries
  its own `metric` — margin, revenue, or cumulative revenue — so a view cannot label an
  axis with one quantity and draw another; the break-even plane is drawn only on a
  margin grid, since on the other two nothing is subtracted and zero is the floor rather
  than a threshold anything crosses. On a cumulative grid the surface rises along time
  and still falls along z, which is the same finding the rate surfaces show, integrated:
  faster tokens per user buy fewer tokens per chip, so the area under the curve shrinks
  too. The unit tests pin the
  relationship: the two grids differ by exactly the flat cost, in every live cell, and
  their holes fall in identical places, because coverage is a property of the run
  history and not of which rate is plotted.
- **The frontier is prepared once and read many times.** `interpolateForGPU` bakes the
  target into its last step and builds ten splines per call; twenty slices that way is
  ~160k spline builds. `prepareFrontier` hoists the Pareto pass and the slope solves
  out and narrows to the three metrics a fleet needs, which is ~2.4k solves plus cheap
  Hermite evaluations. It **composes** `paretoFrontUpperLeft` / `monotoneSlopes` /
  `hermiteInterpolate` and changes none of them, because AGENTS.md hard-syncs those
  with a Python port.

That last point duplicates the 1D module's selection rules, so
`interactivity-surface.test.ts` pins the duplication: `stepsAtInteractivity` must agree
with `bestSoFarProgression` + `mergeProgressionsByChip` at every target — which is also
what makes the slider's slice identical to the 2D line, since the grid selects there —
and
`prepareFrontier` must agree with `interpolateForGPU` at every target inside a range.
Both were mutation-checked — clamping instead of refusing to extrapolate fails five
tests. Note the per-hwKey running-max gate is _not_ pinned and cannot be: the pooled
merge runs its own running maximum and drops the same candidates, so removing that
gate leaves every test green. It is an early filter, not the rule that makes a
staircase.

Rendering notes worth keeping:

- **Rotation is three's own `OrbitControls`**, instantiated imperatively (not via R3F
  `extend()` — it is not an `Object3D`, and imperative lets its `change` event drive
  `invalidate()` for on-demand rendering). No new dependency: `three` and
  `@react-three/fiber` were already here. Elevation is clamped short of horizontal so
  the floor never flips overhead.
- **Surfaces are opaque.** Transparency sorts per object by bounding-sphere distance,
  and five surfaces spanning one volume have near-identical centres, so the order flips
  mid-rotation and they pop in front of each other. Only two things are translucent:
  the break-even plane (one quad, `depthWrite: false`) and dimmed non-focused chips
  (one group, so the sort is trivial).
- **The value axis fills the box; break-even is positioned, not assumed.** It is
  tempting to offset the value range so that $0 lands on world y 0 — then the
  break-even plane needs no offset and "above water" is a sign test on a coordinate.
  That only fits when zero sits at the middle of the range: a margin range of
  −$250k…+$50k, or a revenue grid whose floor _is_ zero, maps outside ±h/2 and the
  surface draws **outside the frame it is inside**. So all three axes span the box the
  same way and the plane sits at `yOf(0)`.
- **The camera distance is fitted to the aspect ratio.** `fov` is the _vertical_ angle,
  so a fixed camera position pads a tall panel with dead space and crops a narrow phone
  viewport. `fitCameraDistance` fits the box's bounding **sphere** — bearing-independent,
  so the framing does not breathe as the reader rotates — and the double-click reset
  goes through the same function. A resize re-fits only while the camera is still where
  the last fit put it, so a deliberate zoom survives one.
- **Colour must go through a canvas probe.** `THREE.Color` cannot parse `oklch()` and
  yields **black** silently — and this palette is oklch. `surface/surfaceColors.ts`
  resolves every colour through a 2d context first.
- **Labels are DOM, reprojected per frame**, not sprite textures: they inherit the
  theme and the font stack, stay crisp at any zoom, and are assertable in tests. Which
  edges carry them is recomputed from the camera azimuth each frame
  (`pickAxisEdges`) — and the value axis deliberately avoids the corner where the time
  and interactivity ticks converge, because three tick families at one corner are
  unreadable.
- **Isolating a chip is the most valuable control here**, more than the rotation:
  height fields occlude each other from every angle, and under the vendor palette four
  of the five chips are greens. Hence the chip row above the canvas.
- **No export.** The PNG path clones the DOM and re-renders through html-to-image, and
  `cloneNode` does not carry a canvas bitmap, so a WebGL view would export as an empty
  rectangle. The 2D chart stays the exportable artefact.
- **No WebGL → a named note.** The context is probed _before_ a `<Canvas>` is
  constructed, so on a GPU-less runner nothing mounts and nothing hangs; a lost context
  after a successful probe swaps to the same note. The section is also folded by
  default, so three.js is not in the initial payload and the grid is not built for a
  reader who never opens it.

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

### Margin per megawatt

A fourth y-axis metric, `marginPerMw` (`c_ly=marginPerMw`), plotting the same
`revenue − TCO` in `$/MW/day`. Two things about it are worth being explicit,
because a reader could reasonably expect more of it than it delivers:

- **It re-ranks almost nothing.** Every chip in this section is sized to the same
  power budget, so per-MW margin is `margin` divided by very nearly the same
  number for every series. The only spread comes from how completely each chip's
  power density fills the budget. What the metric buys is a figure that does not
  move when the budget does — the unit a power-constrained plan is written in —
  not a new ordering.
- **The denominator is provisioned power, not the budget.** `chips × kW/chip ÷ 1000`,
  because chip counts are whole and the remainder of the budget is stranded. Using
  the typed budget would credit each chip with power it never provisioned. An
  unusable figure (no registered power, a budget too small for one chip) leaves the
  metric at zero rather than dividing by it.

Because the rescale is by a positive constant, zero is still break-even — hence
`isBreakEvenAnchored`, which is what the 2D chart's dashed rule and the 3D
surface's plane test rather than comparing against `'margin'` directly.

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

A single blended `$/M tok` against the raw token rate therefore bills ~13.5k tok/s
of which ~92% are cache _reads_, which providers charge a fraction of the fresh
input rate for. On `total` or `input` pricing that overstates agentic margin by
close to an order of magnitude; on `output` pricing (111 tok/s) every fleet is
permanently underwater. At 8:1 with no prefix reuse, one price is a fair
simplification — at 133:1 with 92% hits it is a wrong number.

So the fleet is sized on the physical rate and **billed on a discounted one**:

```
billableTokPerSec = base − inputTput × clamp01(cacheHitRate) × (1 − cacheReadRatio)
```

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
  rate. Opting out bills every input token at full price instead — wrong in the
  direction that understates margin.

`cacheReadRatio` is the one user input here, labelled `Cached input (% of price)`
and defaulting to 10% (the ratio DeepSeek and Anthropic both publish). The cached
_fraction_ it multiplies is measured per config, not assumed. The control is
hidden for fixed sequences rather than shown as a no-op. There is no circularity
with the break-even seed: billable throughput depends only on the ratio, and
break-even then solves the price given that throughput.

**What counts as cached.** `server_gpu_cache_hit_rate + server_external_cache_hit_rate`,
clamped to `[0,1]`. Summed rather than maxed because the two are disjoint in the
measured data: across the 153 production rows carrying both, the sum never
exceeds 1.0 (max 0.972) and never exceeds `theoretical_cache_hit_rate` in any of
the 64 rows with a meaningful external figure. The clamp is not decorative — the
GPU figure alone reaches 1.185 on rows without an external one.

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

### URL params

`c_price`, `c_life` (horizon), `c_ramp`, `c_cache` (cached-input price, % — agentic
only), `c_mtbi`, `c_rec`, `c_ly` (y-axis metric —
`margin` | `marginPerMw` | `revenue` | `cumulativeRevenue`, parsed against that allowlist so a stale
or hand-edited link falls back to `margin` rather than seeding an unknown metric).
The first two default to
`''` in `PARAM_DEFAULTS` because their real defaults are derived, not constant — see
the comment there. The MW budget is
`c_mw`, owned by `ThroughputCalculatorDisplay` and passed to both the fleet
planner and this section so one input drives both.
