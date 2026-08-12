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

- **Disagg is grouped separately** (`b200` vs `b200|disagg`). Disaggregated configs
  report throughput per decode or prefill chip, so their fleet sizing is on a
  different basis; pooling them would switch that basis mid-line at whichever step
  happened to win, silently. The chip label carries a `(disagg)` marker, since
  otherwise two rows read as the same chip.
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
revenue │        ┌────── each step is a config that beat the ones before
        │    ┌───┘
        │ ┌──┘
────────┼─┴─────────────────────────────────  cost: flat, the racks
        └──────────────────────────────────▶  months since model release
```

An earlier iteration modelled a TTFI delay, a smoothstep ramp to a flat plateau
and a decommissioning taper. That was all assumption, and it collapsed each
chip's optimisation history into a single number held constant for years — so
every chip drew the same shape and the configs visibly never changed. The
measured progression is both more honest and the actual finding.

Three conventions the numbers depend on:

- **Cost is flat.** It is `chips × $/chip/hr`, and neither term moves when a
  config improves — the racks bill the same whatever the software does. That is
  what makes the gap between the lines the return on software progress, and what
  makes early months legitimately underwater at a price the later configs clear.
- **A config holds until the next one lands**, so the line is a step
  (`d3.curveStepAfter`), not a smooth ramp. Drawing it curved would assert the
  fleet got gradually faster between sweeps, which is not what happened. Markers
  are drawn only on risers, so every dot on the chart is a sweep the user can
  open.
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

### Overlay exemption

This section is official-only, and unlike the fleet planner that is not a policy
choice: unofficial runs are not ingested, so `/api/v1/benchmarks/history` cannot
serve them. Taking AGENTS.md's documented exemption; the section states the
exclusion in its own note rather than leaving a silent gap.

### URL params

`c_price`, `c_life` (horizon), `c_mtbi`, `c_rec`. The first two default to `''` in
`PARAM_DEFAULTS` because their real defaults are derived, not constant — see the
comment there. The MW budget is
`c_mw`, owned by `ThroughputCalculatorDisplay` and passed to both the fleet
planner and this section so one input drives both.
