# TCO Calculator — Design Rationale

## Why Interpolation Instead of Raw Data

Users want to compare GPUs at a specific interactivity target (e.g., "which GPU is cheapest at 200 tok/s/user?"). Raw benchmark data has discrete concurrency points, so GPU A might have data at 180 and 220 tok/s but not exactly 200. Interpolation fills the gaps using the same Pareto front + monotone spline used for roofline curves.

This means the calculator's values are **estimates derived from real data points**, not direct measurements. The calculator's description and table footer say so explicitly.

## Why Steffen Method for Splines

The Steffen method (monotone cubic Hermite) was chosen over standard cubic splines because:

1. **Monotonicity**: Prevents the spline from overshooting between data points. Standard cubic splines can produce negative throughput values between two positive points.
2. **D3 compatibility**: Matches `d3.curveMonotoneX`, so interpolated values align visually with the roofline curves drawn on charts.
3. **Clamped to the measured range**: every interpolated value is clamped to the frontier's own `[min, max]` (`interpolation.ts`), so sparse data or steep gradients cannot produce a value outside the measured ones.

## Multi-Precision Composite Keys

When comparing FP4 vs FP8 for the same GPU, each precision needs its own Pareto front and spline. The composite key `hwKey__precision` (e.g., `b200_sglang__fp4`) ensures:

1. Separate Pareto fronts per precision (mixing them would create invalid curves)
2. Separate bars in the chart (users see FP4 and FP8 side by side)
3. The `__` separator can't appear in hwKey (uses `-` and `_`) or precision names, so parsing is unambiguous

`InterpolatedResult.resultKey` = composite key (for selection/comparison). `.hwKey` = base key (for color/config lookup). `.precision` = only set when multi-precision active.

## Token Type — Most Common Bug

When adding any metric or rendering path that touches throughput, cost, or power: it MUST go through `getThroughputForType()` / `getCostForType()` / `getTpPerMwForType()`. Never read `result.cost` directly.

## Unofficial-Run Overlays (`?unofficialrun=`)

A loaded unofficial run contributes an extra bar per (hardware × run) to the bar chart, in the run's palette color (`overlayRunColor`) and labeled `B300 (✕ my-branch)`. The label keeps the branch inside the same paren group as the precision so the `twoRowYAxisLabels({ split: 'parens' })` y-axis customizer still splits it into two rows.

**Overlay results are interpolated separately from official ones.** `useThroughputData` builds two group maps — `gpuDataByGroupKey` (official) and `overlayGpuDataByGroupKey` (per-run, keyed `hwKey[__precision]__run<idx>`) — and runs `interpolateForGPU` over each independently. Folding overlay points into the official Pareto front would silently move the official numbers, and you'd lose the before/after delta that makes the overlay useful in the first place.

Both paths share one row → `GPUDataPoint` mapper, `buildGpuGroups`, so an overlay bar and its official twin can never differ because of a mapping drift. Group identity is carried in `gpuGroupMeta` / `overlayGroupMeta` rather than re-parsed out of the key string; `CostTargetPanel` still splits keys itself, which is safe because it only receives official keys.

Overlay rows arrive unfiltered by model (the unofficial-run API returns every model in the run, while `/api/v1/benchmarks` is already model-scoped), so the hook filters them with `DB_MODEL_TO_DISPLAY`.

**Only the bar chart and its legend show overlay data.** The table view, CSV export, and cost-target panel deliberately stay official-only. An exported sheet or an MW projection that silently blends in numbers from an unmerged branch is worse than one that omits them. This is why `barResults` (official + overlay) exists separately from `results` (official) and only reaches `ThroughputBarChart`.

Legend behavior:

- One entry per run that contributes bars, same shape as the inference/evaluation overlay legends (`✕ <branch>`, palette swatch, workflow link). The entry is a label, not a series: per-run removal happens in the banner, so it sets `isRemovable: false` (a default-true opt-out on `CommonLegendItemProps`). Without it those always-active entries inflate `ChartLegend`'s `activeCount`, which is the guard that stops the hide control emptying the chart — and their own hide control would call `removeGpu` with an `overlay-run-*` key and do nothing.
- Hardware entries merge official hardware with hardware only the run has data for (`legendHwKeys`), otherwise an overlay-only bar would be unhideable.
- `visibleHwKeys` is the **single source of truth** for both series: one legend entry governs a GPU's official and overlay bars together.

That last point is deliberate and worth not "fixing" back. The obvious-looking alternative — read/write the provider's shared `activeOverlayHwTypes` for the overlay series — gives the one legend two backing sets, and every way they drift renders a legend entry that contradicts the bar beside it:

- a selection-scope change reseeds `visibleHwKeys` when the available hardware changes but has no business reseeding a set two other tabs share, so a GPU hidden before a model/sequence switch comes back as "active" in the legend with its overlay bar still hidden;
- the inference or evaluation tab re-enabling a GPU resurrects its calculator overlay bar while this tab's legend still marks it inactive.

Per-tab hardware visibility is already how the calculator treats official data — `visibleHwKeys` has never been shared with the inference tab — so the overlay series just follows the same rule. AGENTS.md's "respect `activeOverlayHwTypes`" exists so overlay points can't ignore a user's hide action; here the calculator's own legend _is_ that hide action. `calculator-overlay.cy.ts` pins the first scenario ("brings hidden overlay bars back when the available hardware changes").

### Seeding the legend selection

`resolveCalculatorVisibility` derives `visibleHwKeys` from the user's last legend intent (`{ scopeKey, visible, known }`). Two rules matter.

- **The scope key** includes the **official** hardware list (`availableHwKeys`), not the merged one, and a scope change shows every legend entry again. A run is fetched separately from the benchmarks and usually lands later, so scoping on the merged list would let a late overlay arrival, or a run dismissal, wipe GPU filters the user had already set.
- **Overlay arrival/departure** is applied **additively**: legend keys missing from `known` start visible, departed ones drop out, everything else keeps whatever the user set. It falls back to all legend hardware if the result would be empty, so dismissing a run while an overlay-only GPU was soloed can't leave a blank chart.

`toggleGpuVisibility` counts visible keys against `legendHwKeys` rather than comparing raw set size, so a stale entry can never skew solo/show-all.

### Honesty in the tooltip

- **Clamped values.** `interpolateForGPU` clamps the target into each series' measured range and always returns a value, so a bar can be showing its nearest edge point rather than an interpolation. This is pre-existing across GPUs with different ranges, but widening the slider to cover overlay operating points makes it reachable for every official bar at once — which would turn a side-by-side overlay delta into a real-vs-clamped comparison. Results carry a `clamped` flag and the tooltip says so. (Narrowing the slider back is not the fix: it only moves the clamping onto the overlay bars, and an overlay-only model loses its bounds entirely.)
- **Escaping.** The tooltip is a hand-built HTML string injected with `.html()`, and branch names and run URLs come from the GitHub API for whatever run id the user pasted. Everything untrusted goes through `escapeHtml` (`lib/shared/utils`). The y-axis tick labels render the same branch but go through d3 `.text()`, and the legend entry is React — both already safe.

The calculator supports both fixed-sequence and Agentic scenarios through
the shared `rowToSequence` classifier. Agentic rows carry null `isl`/`osl`, so
filtering them by numeric sequence lengths would silently drop every point.

Agentic interactivity follows the same definition as the main inference chart:

- P90 by default, with P75 selectable behind the feature gate and shareable through `i_pctl`
- interactivity derived as `1 / ITL`, never trusted from a potentially stale
  artifact-supplied `*_intvty` field
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

`/inference` plots these metrics only at measured points (`lib/charts/chart-utils.ts`,
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
`[0,1]`. Missing cache telemetry bills the input stream at the uncached price, except on GB300, where `pricingCacheHitRate` falls back to the row's `theoretical_cache_hit_rate`.
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

### The measurement (splined versus derived cost)

Per point,
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
`/inference` plots cost only at measured points, as `specs.costh / millionTokensPerHour`
(`buildDerivedChartFields` in `lib/charts/chart-utils.ts`, `roof: false`). Holding out each interior frontier
knot in turn, rebuilding the frontier from the rest and predicting the held-out
point's real cost:

| method                          | mean err | p50   | p90    | p99     | closer to oracle |
| ------------------------------- | -------- | ----- | ------ | ------- | ---------------- |
| splined `result.cost`           | 162.8%   | 86.3% | 528.1% | 1402.1% | 36 / 144         |
| derived `k / interpolated tput` | 42.2%    | 23.0% | 72.0%  | 245.3%  | **108 / 144**    |

The structural argument is stronger still. That oracle construction makes
`cost x throughput = $/GPU-hr` an identity at every real point. Splining the two
independently breaks it. Measured that way, the pair violated it by a median 71.6% and
up to 2026%, i.e. it reported an operating point no real config could occupy.
Deriving cost from the interpolated throughput satisfies the identity by
construction.

## Fleet Lifecycle (`/fleet`)

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

### `view=calculator` on the history route

The history response is ~8.6 MB per model. `useHistoricalBest` gates the fetch
on a facility power budget being set, and requests `view=calculator` to trim it
to the calculator's metric allowlist (~24% smaller).

**That trim must stay opt-in.** `CALCULATOR_METRIC_KEYS` excludes the
measured-power metrics Historical Trends plots, so applying it to every history
response would silently blank those charts.

### Lifecycle math (`lifecycle.ts`)

It takes a `ThroughputStep[]`, one entry per measured improvement, and turns it into a
revenue staircase over calendar time against a flat cost line.

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

### Token price defaults to break-even

Break-even is per-chip, so a single global price input needs one anchor: the
**cheapest visible chip's** break-even, i.e. the competitive floor at which that
chip earns exactly nothing and everything pricier is underwater. It re-seeds when
the tier, token type or target changes, and stops the moment the user edits the
field (or arrives with `c_price` in the URL); a reset link restores it. The
figure comes from the TCO model — everything above that line is the user's
assumption, and the section says so.

It comes from `breakEvenPricePerMTok`, which divides the fleet's flat `costPerHour` by its
billable token rate (billable input plus output weighted by the output/input price
multiple) after the availability haircut. So the plotted margin is exactly zero at the
default, for that chip at its **latest** config.
Under the default price every other series therefore sits below the rule, and each
one's own earlier steps sit lower still. That is the competitive floor being read
correctly, not a scaling bug; raising the price lifts the whole fleet.

Break-even is derived from the interpolated throughput, like every reciprocal metric
([Reciprocal Metrics](#reciprocal-metrics-are-derived-not-splined)). Fleet cost is
`gpus x $/GPU-hr`, a constant with no interpolation in it, so no other price can zero
the plotted margin.

### The disaggregated token-split trap

`input_tput_per_gpu` is per **prefill** chip, `output_tput_per_gpu` per **decode** chip,
and `tput_per_gpu` per chip **overall**. Three denominators. On an aggregated run they
coincide and the two rates sum to the total on all 937 production rows. On a
disaggregated run they do not, and the gap is large: across 308 disagg rows the two
rates sum to between 1.00× and **16.11×** the total, tracking
`(prefill + decode) × (isl/prefill + osl/decode) / (isl + osl)` to four decimals.

`tput_per_gpu` itself is **not** affected: it is per chip overall for both kinds, which
reproduces exactly from the absolute rates and the chip counts — on the first disagg row
in production, `(54.521×8 + 6.857×8) / 16 = 30.68886 = tput_per_gpu` to five decimals.
So the ranking, the sizing and the cost line are comparable across an
aggregated→disaggregated handover. Only the two per-stream rates are not.

**Concurrent users** carry the same trap. Dividing the per-_decode_-chip output rate into a
whole-fleet chip count overstates the stream count by `(prefill + decode) / decode`, a
median 2× and up to 7× in production history. They use `outputTokPerChip`, which re-bases
onto chips overall and is a bit-for-bit no-op wherever no share is known.

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

**Selection needs the same correction.** A _ranking_ (which config wins each step) that
reads `inputTpPerMw` / `outputTpPerMw` raw lets a disaggregated config win a rung purely
for having been divided by fewer chips.

So `getComparableTpPerMwForType` splits `tpPerMw` by the same share, and the
lifecycle selection (`useHistoricalBest`) uses it.
For an aggregated config it is an exact identity — the rates already sum to the total, so
`tpPerMw × share` _is_ `inputTpPerMw` — so only disaggregated rows move.

A corollary worth stating: on a fixed
sequence the input/output split changes the **level** and the break-even price, but it
cannot reorder chips, because the mix is the same for all of them. On agentic traces the
mix is measured per config, so there it can.

### Agentic traces, and cached input tokens

Agentic revenue needs a cache term. Measured against production history
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

**A partly-measured frontier opts out.** `interpolateForGPU` splines the rate only when
_every_ frontier point carries one; substituting 0 for the missing points would invent a
dip in the cached fraction and overstate the billable rate. Opting out bills every input
token at full price instead, which overstates revenue and margin when the missing point
actually had cache hits.

`cacheReadRatio` is the one user input here, labelled `Cached input (% of price)`
and defaulting to 10% (the ratio DeepSeek and Anthropic both publish). The cached
_fraction_ it multiplies is measured per config, not assumed, except that GB300 rows without a measurement fall back to their `theoretical_cache_hit_rate` (`pricingCacheHitRate`). The control is
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

### Overlay exemption

This section is official-only, and that is not a policy choice. Unofficial runs are not
ingested, so `/api/v1/benchmarks/history` cannot serve them. The section takes AGENTS.md's
documented exemption and states the exclusion in its own note rather than leaving a
silent gap.

### What is still not apples-to-apples, and why it was left alone

The bar chart and the table still show
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
  licenses, which `maxInteractivityAtCost` depends on, so the cost-cap card would answer
  against a different cost curve than the bars;
- and dividing the displayed `$/chip-hr` by the displayed throughput would stop giving the
  displayed cost, for disaggregated rows only.

Fixing cost alone is therefore not available. The choice is all of it or none of it, and
the notes now carry the correction instead: which figures are affected (Input and Output,
never Total), in which direction (flattering), by how much, and that the Fleet Lifecycle
page is deliberately on a different basis.

## Profit Estimator (`/profit-estimator`, `/profit-estimator-per-gigawatt`)

Fleet Lifecycle answers "what did a fixed fleet earn over its life". These two tabs
answer a narrower, present-tense question: at one interactivity operating point, what
does each chip earn today, and who keeps it? The two tabs differ only in the denominator
(`ProfitBasis`), either one GPU-hour (`chip-hour`) or the GPU-hours one all-in utility
gigawatt-year buys for that SKU (`gw-year`).

Both tabs offer the same model list. A model needs AgentX (`agentic_traces`)
measurements with an interpolable operating point and a token price source.
The page intersects its supported routes with live AgentX availability, so a
model without current trace data disappears from the selector. Muse Spark Open,
Qwen3.5, Qwen3.8 Flash Next, and MiniMax M3.1 Flash use OpenRouter pricing by
default; users can supply custom prices. GLM-5 currently has too little trace
data to interpolate a profit row.
The public profit view APIs accept any known model and may return empty rows;
their `model` parameter is not restricted to the dashboard's list.

The four additions use model-specific default P90 interactivity targets. On
2026-10-24, a sweep of the public profit view API at every 5 tok/s/user from 5
to 150 found these lowest targets that maximize priced official SKU rows in
that range (using custom token prices to keep price availability independent of
curve coverage):

| Model              | Rows at 45 | Default target (tok/s/user) | Rows at default |
| ------------------ | ---------: | --------------------------: | --------------: |
| Muse Spark Open    |          1 |                          85 |               7 |
| MiniMax M3.1 Flash |          2 |                         125 |               7 |
| Qwen3.5            |          2 |                         115 |              10 |
| Qwen3.8 Flash Next |          3 |                          90 |               6 |

Both per-chip-hour and per-GW-year views returned the same row counts at these
targets. New benchmark runs can change the coverage. The target remains an
editable operating-point assumption, not a hosted API speed claim.

### Decisions worth knowing

- **Utilization scales revenue only.** 60% means the fleet bills 60% of the tokens
  the benchmark says it could produce. Chips are paid for whether or not they are
  busy, so TCO is untouched. The haircut is not drawn as its own segment; the bar
  simply tops out at realized revenue, and the caption states the rate.
- **The model license fee is a share of revenue, not of gross margin.** It is a
  royalty on every token sold, so it is owed even when compute alone already exceeds
  revenue. The UI calls it "Model License Fee (%)"; code and test ids keep the older
  `labCut` name.
- **Out-of-range reads are excluded, not clamped.** A config the target
  interactivity falls outside of (H200 on Kimi K3 at 45 tok/s/user, say) is not
  drawn and not offered in the legend. This matches the fleet page, which drops
  those points rather than showing an edge value that was never measured.

## First-Token Limits (`/first-token`)

The calculator answers "what does each chip cost at this interactivity". This tab adds
the constraint an interactivity target leaves out: how long the user waits for the first
token. For each cap in a ladder it keeps, per vendor, the cheapest **measured** row whose
interactivity clears a floor and whose TTFT is under the cap.

- **Measured rows, not the frontier.** The calculator's spline tracks throughput against
  interactivity; a TTFT cap is a third constraint the frontier does not carry, and a knot
  that interpolates cheaply can sit between two rows whose first-token waits differ by
  seconds. Reading rows keeps every bar a configuration that ran under both constraints,
  and gives the tooltip and table a run URL to cite. The trade is granularity: a cheaper
  configuration can sit just outside a cap and only appear under the next one, which the
  note under the chart says.
- **`ttft` on `GPUDataPoint`.** The shared row → point mapper (`buildGpuGroups`) sets it,
  so official and overlay rows get it by the same rule. It is absent, never zero, when
  the row has no measurement: a zero would clear every cap.
