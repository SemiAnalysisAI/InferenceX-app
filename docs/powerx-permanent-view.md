# PowerX Permanent View

How the PowerX article's power-boundary figures live inside `/inference` instead of a
separate page. The measured-power UI, the four power boundaries, and their share links all
sit in the existing ↑↑↓↓-gated **Measured Energy** metric group.

## Purpose

The article compares one deployment's power at four boundaries, from the GPU board to the
utility meter, as W per GPU, as J per output token and as J per total (input + output)
token. The dashboard already had
GPU-measured telemetry (`measured*` metrics) and an ungated all-in provisioned energy
(`jOutput`). This view adds the other boundaries as ordinary y-axis metrics so every chart
feature (zoom, tooltip, Perf Ruler, Optimal Only, Table, CSV, PNG, `?unofficialrun=` overlay,
share URL) applies unchanged. One chart engine, no second chart component.

## Gate

The Measured Energy group is `gated: true` in `metric-registry.ts`, and the boundary metrics are
members of it (`POWER_BASIS_METRIC_CONFIG_KEYS` is spread into it). `ChartControls` hides a
gated group while the gate is locked unless the selected `i_metric` belongs to it, so a shared
link to any boundary renders for a reader who never unlocked the gate.

## Boundaries

Formulas, the all-GPU normalization (`N_alloc` = prefill + decode GPUs for disaggregated
rows) and the null rules are specified in
[Data Transforms → Power boundaries](./data-transforms.md#power-boundaries); the chassis and
NVL72 tray models themselves in [PowerX System Power](./powerx-system-power.md). The ungated
`jOutput` keeps its per-decode-GPU normalization; its labels and the boundary metric's
`all GPUs` label keep the two distinguishable in the selector, the availability list and CSV
headers.

## Why the metric key carries the boundary

There is no `i_pbasis` URL parameter. The Boundary select in `MeasuredMetricControls` is
presentation over `selectedYAxisMetric`, exactly like Per / Scope / Statistic / Display /
Unit: `measured-metric-config.ts` gives every Measured Energy key a `basis` and resolves each
control change to the nearest registered key. Consequences:

- One share link per figure, and `i_metric` already round-trips through every existing
  surface (share button, Historical Trends hand-off, Table, CSV header).
- Existing links are byte-identical: all `measured*` keys carry `basis: 'gpu-measured'`.
- A derived boundary publishes the `POWER_BASIS_FIELDS` quantities for the whole deployment:
  joules per output token and joules per total token, plus average watts on All in Measured.
  Per moves between output and total tokens on it, and choosing it keeps the current
  combination when it publishes that combination (GPU measured J per total token goes to the
  boundary's J per total token); otherwise the choice snaps to its first combination (average
  watts or joules per output token). Changing any other setting while on a derived boundary
  returns to GPU measured, so no control ever points at a key that does not exist.
- A gated metric selected through a shared URL keeps its Measured controls, as the
  `measured*` siblings already do.
- The Y-axis dropdown's collapsed "Measured Power" / "Measured Energy" option for the other
  family resolves through `changeMeasuredMetricConfig(key, { family })`, which keeps `basis`,
  so switching family from the dropdown keeps the boundary. From a metric outside the measured
  families the option opens on `MEASURED_METRIC_DEFAULTS[family]` (GPU measured).

The Boundary select tracks `inference_power_basis_changed { basis, family }` in addition to the
existing `inference_y_axis_metric_selected` fired by `ChartControls`. Its All in Measured option
carries the (i) help `ALL_IN_MEASURED_NOTE` (unmeasured components are modeled); the chart
caption states the same boundary, so the controls row has no separate footnote.

## Missing values

A point without a value for the selected boundary is omitted from that series only (the
builders never emit `{ y: 0 }`, and both the official and overlay paths filter by
`metricKey in point`).

The chart caption (`data-testid="power-basis-assumptions"`) names the boundary, the formula in
words, the PUE constant and the chassis-model revision so a screenshot records its method.
The pinned tooltip's "Modeled system power" block (`tooltipUtils.ts` `modeledSystemPowerHTML`)
renders only for `measured*` keys and the All in Measured keys (`isAllInMeasuredConfigKey`), so
on the two provisioned boundaries the caption is the only per-chart provenance; the caption does
not promise more.
When no point in the selection reports the selected telemetry axis, the chart's empty state says
the selection has no measured GPU power (`noMeasuredDataHint`) instead of the generic hint.

## PowerX layout

`/powerx` and `/zh/powerx` render the shared `ChartDisplay` data pipeline and the same page
chrome as `/inference`, so the two tabs read as one dashboard. Nothing in the data layer
changes: PowerX writes the same `i_metric` and `i_pcompare` state, so share links,
`?unofficialrun=` overlays and the views API are untouched.

- Header card (`DashboardSectionHeader` + `ChartControls`, as on `/inference`): title and
  description, then the four views as a tab strip (`PowerXViewTabs`: Energy per token, Power
  draw, Where the power goes, Over time; `powerx-views.ts` maps each tab onto a metric +
  compare pair, see `selectPowerXView`), then the **Benchmark Config** fieldset (Model,
  Scenario, Precision through the shared selectors), the **Chart Config** fieldset (X-Axis
  Metric beside `PowerXChartConfig`: Count, Per or Show as, then Scope and Power statistic
  on the views they apply to (the Energy view opens on Per: All tokens, J per input + output
  token, because aggregated serving shares GPUs between prefill and decode and cannot split
  their energy by phase; only All tokens and Output carry the IT, Facility and rated
  boundaries, `ENERGY_METRICS` in `powerx-views.ts`), and the Rated boundaries toggle where rated lines exist, all as
  plain labelled controls with no expander) in place of the Y-axis metric pick, the
  **Compare history** fieldset, and the run date / run / changelog row. On phones the Chart Config and
  Compare history fieldsets fold into "More chart controls" exactly as on `/inference`. Under `md`
  the view tabs become a 2×2 grid of 48 px buttons, Count and Per (or Show as) render as native
  selects (`SegmentedToggle` `variant="select"`, each option carrying the segment's hover hint),
  and the X-Axis Metric, Scope, Power statistic and Rated boundaries sit behind one "More" row
  (`powerx-more`, "More · N changed" via `powerXSecondaryChangedCount`); dashboard toasts stay
  off there and the pinned point sheet says Tap. From `md` up nothing changes.
- The Chart/Table toggle and the export menu sit above the chart card, right-aligned, like
  `/inference`; the chart card keeps the h2 caption (model logo + title), the Updated / Source
  line, the readout badge row, the Quick Filters legend (no PowerX controls in the rail) and
  the footer notes. On phones the plot height is capped at 55 % of the viewport.
- Where the power goes (`i_pcompare=breakdown`): the caption stays at the top of the card and
  the chip comparison is the visual. The compared chip's drill-down (the "across load"
  stacked bars / stacked area, with its Hardware select, Stacked bars | Stacked area toggle
  (`i_pbview`), TDP and All in Provisioned reference lines and PNG/CSV buttons) is open
  inline under that chip's bar from the first render and follows the slider to whichever
  chip is nearest; clicking a bar or picking another chip in the Hardware select moves it,
  Collapse hides it for the session (`PowerAnalysisPanels`). The stack
  legend above the bars is the only one. There is no boundary line chart on this view: the
  three measured boundaries are compared on Power draw under Count: All.
- Chip rows keep a fixed order: official lines in `HW_REGISTRY` order (the chart legend's,
  `orderBreakdownSeriesForDisplay`), unofficial-run lines after them in run order. A row
  never changes place when the slider moves or a chip is pinned; a chip with no point
  within 1.5× of the slider is named in the "Not benchmarked near" note as before.
- Per-chip compared point (`i_pbpoint`): clicking a column of the open drill-down (stacked
  bars or stacked area) pins that chip's compared point to that column. Only that chip
  changes: its row (bar, watts, `c<N> · <interactivity>` label, a `×` marker whose `title`
  reads "Pinned to c<N> · click to follow the slider"), the dashed outline in its drill-down
  and the parts list; the slider does not move and the other chips keep their
  slider-derived point. The slider is the global control: moving it drops every pin.
  The Hardware select and Collapse keep the pins. The `×` marker unpins that chip alone.
  `i_pbpoint` carries `seriesKey:concurrency` pairs joined by commas (`b200_vllm|fp8:64`;
  `|run<N>` keys for `?unofficialrun=` lines), only for pinned chips, and is read once on
  load; a pair naming a chip or a concurrency the view does not have applies to nothing.
  This is a presentation-only selector over data the views API already returns
  (`powerBreakdown=true` rows carry every point), so it adds no API selector.
- Touch (PowerX on a coarse pointer, `useIsCoarsePointer()`): the drill-down's hover label
  and tooltip give way to a scrub. A finger anywhere across the plot moves a solid rule to
  the nearest column (`nearestColumnIndex`, by column centre) and the readout above the
  plot (`PowerBreakdownReadout`: total W/GPU with its basis pill, `c<N> · <interactivity>`,
  one chip per layer in stack order with the plot's swatches; tapping a chip isolates the
  layer) reads that column; the svg keeps `touch-action: pan-y`, so a vertical pan still
  scrolls the page, and is `none` only while a scrub is in progress; the plot's top margin
  is 16 px instead of 40 under the readout. A tap holds the column through the same
  compared-point pin as a desktop click (dashed outline, `i_pbpoint`) and nothing else: on
  touch a layer is isolated only from a readout chip, so the chart does not dim on the tap.
  The readout then says Pinned until the next scrub or the row's pin marker. The 44 px "Compare
  chips at N tok/s/user" button under the plot moves the slider to the readout's
  interactivity (the slider's own action, so every pin drops; `powerx_compare_at_scrub`),
  disabled while the slider already reads it. A mouse keeps the hover label and the click.
- Phones (PowerX under `md`, `useIsMobileViewport()`): the chip rows are 56 px cards (name
  and total W with its basis pill on the first line, `c<N> · <interactivity>` with the pin
  marker and "GPU NN%" on the second, one 8 px stacked bar with the same layer steps and
  hatches and no in-bar watt labels; `data-layout="compact"`), the parts list folds to its
  three largest IT parts by watts (the facility row always folds) plus an "All N parts ·
  across load" row (`power-parts-toggle`, `aria-expanded`/`aria-controls`,
  `powerx_parts_expanded`) that opens the rest in place, in 56 px rows (name, watts and
  share above the 8 px bar and the sparkline). Open, the list keeps its order and a tap pins
  a row where it is; when the list folds, a pinned part that sits in the remainder stays
  among the visible rows (`foldPowerPartRows`). The CSV export keeps every part. With the touch readout above the plot the drill-down plot is
  260 px high instead of 380 (`PHONE_PLOT_HEIGHT`). From `md` up nothing changes.
- A pinned point's "View power trace" action opens the Over time view focused on that trace.
- The footer carries no PowerX-specific note: the former collapsed "How we measure" details
  is gone, and only the shared /inference footer notes remain. The meaning of the GPU /
  IT / Facility tags lives in each pill's `title` (`POWER_BASIS_TAG_TITLES`), not in prose.

### P0 additions (IT basis, headroom, load swings, labels)

- **IT-only basis** (`lib/power/power-basis.ts` `it-modeled`): `deploymentItWatts ÷ gpuCount`
  from the same `modeledSystemPower` estimate B4 uses, i.e. the breakdown stack minus its
  `facility` part, never a new formula; `utilityModeledWatts = itModeledWatts × PUE` at every
  point. Metric keys `y_itModeledWatts` / `y_itModeledJPerOutputToken` carry the boundary
  through `i_metric` like the other bases (no new URL parameter; old links are unchanged).
  `POWER_COUNT_LABELS` names the three measured boundaries GPU only / IT (no PUE) / Facility
  on PowerX (legend rows, line labels, pills, table series column, CSV); the registry label is
  "All in Measured IT (no PUE)". Count: All on Power draw (and on Energy per token or per output token)
  sets `i_pcompare=boundaries`, which draws all three per chip on the one scatter
  (`COUNT_COMPARE_BASES`: GPU only solid, IT dashed, Facility dash-dot) with the Boundary
  legend section; the X-Axis Metric and Show as controls apply as on any Power draw chart.
  The **Rated boundaries** toggle in Chart Config (Off | All-in provisioned) sets
  `i_pcompare=provisioned` on the GPU-only metric, which draws exactly two lines per chip
  (`PROVISIONED_COMPARE_BASES`: GPU Level Measured solid, All in Provisioned dashed; no IT,
  Facility or GPU-level TDP line, to keep the chart readable); turning it off returns to the
  single GPU-only series. The five-line `all` is reachable from share links only; turning
  the toggle off there returns to the measured three.
- **Readout row** (`PowerXReadout`, under the caption on Energy and Power draw, in the TCO
  badge row's outline-badge style): IT W/GPU,
  GPUs per MW (`1e6 ÷ IT W`), Facility W/GPU at PUE and measured GPU W for the hovered or
  pinned point (`PowerXSurfaceProvider` active-point context, fed by `ScatterGraph`), or the
  point nearest 80 tok/s/user. On a coarse pointer the chart has no hover tooltip: a finger
  dragged across the plot snaps to the nearest visible point, official or `?unofficialrun=`
  overlay under the current zoom (`nearestScrubCandidate`, the `powerx-scrub` layer: a rule
  plus a ring in the chip or run colour), and the row leads with the chart's own y value
  (`yMetric`, formatted as the tooltip would) for it (`source: 'scrub'`, which replaces a
  pinned point and survives the compat hover end a tap synthesises); a tap on a point still
  opens the point sheet as before.
- **Where the power goes** stacks IT only by default; the Include facility switch
  (`PowerXFacilitySwitch`, context state, not a URL parameter) appends the PUE part after a
  gap. `breakdownSeriesAtBoundary` derives the IT series from the breakdown so the chip
  comparison, the drill-down and the tooltips agree; the note "Storage and out-of-rack
  network are not modeled" stays under the bars.
- **Headroom** (Power draw shown as % of TDP, no comparison): `ScatterGraph` adds a
  `powerx-headroom` layer, beneath the lines, that shades between each chip's P90 line (P90
  W × the point's own % TDP ÷ avg W) and 100 %; the y-axis reaches the rating so the band
  ends at the dashed 100 % TDP line. Unofficial-run overlay lines get their own band in the
  run's color (`overlayRunColor`), filtered by `activeOverlayHwTypes`. `PowerXHeadroomTable`
  lists avg W, P90 W, % TDP (P90) and headroom = 1 − P90/TDP at 25 / 50 / 100 / 300
  tok/s/user via `lib/power/headroom.ts` (`interpolateMetricAtInteractivity`, so the numbers
  match the chart's iso-interactivity readings; outside the measured range is "—"), one row
  per overlay line and run after the official rows (`runIndex`, run-colored dot, the run tag
  in the label), with a CSV button (`source` column: official / unofficial) and one example
  sentence read from the official points. The views API serves the official rows with
  `headroom=true`.
- **Load swings** (Over time, PowerX only): `PowerLoadSwings` computes
  `lib/power/load-swing-stats.ts` per visible trace (peak, min, idle floor = P5 before the
  window, window mean, P5/P95, max Δ1s / Δ5s in W and % TDP, ramp up/down W/s, volatility =
  std ÷ mean; telemetry gaps are counted, never bridged), a × 72 per NVL72 rack switch, and
  per-point CSV / JSON links to `GET /api/v1/gpu-metrics-point/stats?id=N[&format=csv|json]
[&scale=gpu|nvl72]`, which runs the same function over the same stored buckets
  (`storedPowerSeries`). The fixed caveat line under the chart reads "1 s DCGM samples ·
  single node · inference only · sub-second swings not captured".
- **Labels**: `PowerBasisPill` (GPU / IT / Facility) on readouts, table headers, the breakdown
  totals and the tooltip's power-model block; each pill's `title` is the tag's one-clause
  meaning (GPU board power, measured by DCGM · GPU + modeled server, no PUE · IT × PUE).

## Article figure → share link

Base: `/powerx?g_model=<model>&i_seq=8k/1k&i_prec=<precision>` plus the hardware legend
selection. Old `/inference` links that carry a measured `i_metric`, or a power-tier filter (`i_power`)
with no metric, are redirected to `/powerx` with the same query by `src/proxy.ts`
(`lib/routing/powerx-redirect.ts`; the no-metric case lands on the Power draw scatter,
`i_metric=y_measuredAvgPower`, as such links used to chart power); Inference Performance
no longer offers power metrics. Append:

| Figure | Content                                       | Parameters                                                                                                                                                                                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2      | H200 W/GPU, measured boundaries + rated lines | `&i_metric=y_measuredAvgPower&i_pcompare=boundaries` draws GPU Level Measured and All in Measured; the rated lines are on the timeline (`&i_metric=y_measuredPowerTimeline`, all-in switch `&i_ptutility=1`) |
| 3      | H200 J/output token, all four boundaries      | `&i_metric=y_measuredJPerOutputToken&i_pcompare=all` (single boundary: the matching `…JPerOutputToken` key)                                                                                                  |
| 3b     | H200 J/total token, all four boundaries       | `&i_metric=y_measuredJPerTotalToken&i_pcompare=all` (single boundary: the matching `…JPerTotalToken` key)                                                                                                    |
| 4 / 5  | B200 vs B300, GB200 vs GB300 at fixed X       | `&i_metric=<measured key>&i_rulers=<x>` (Perf Ruler, T1)                                                                                                                                                     |
| 6      | Prefill vs decode W/GPU with the whole deploy | `&i_metric=y_measuredAvgPower&i_pcompare=roles`                                                                                                                                                              |
| 7      | Reconstructed request energy, prefill share   | `&i_metric=y_measuredJPerOutputToken&i_pcompare=roles` (prefill share in the clone's tooltip)                                                                                                                |
| 1      | Measured power over the benchmark job         | `&i_metric=y_measuredPowerTimeline` (Display → Timeline, see below)                                                                                                                                          |

Pinned official dashboard points offer **View PowerX** when the feature gate is unlocked
or a measured-metric share link is active. The lazy in-page dialog reads the existing
`GET /api/v1/gpu-metrics-point?id=N` API, without entering a run ID or changing chart filters.
This also works in the hardware/date comparison view. The per-chip chart and statistics span
the recorded job (including startup/warmup), not just the audited serving window. Fixed-sequence
points do not request AgentX server-metric overlays. Missing telemetry is shown as unavailable,
not zero power. Unofficial points have no database ID and retain **View power trace**, which
resolves their run/audit provenance automatically.

## Comparison series (`i_pcompare`)

`i_pcompare=boundaries|provisioned|all|roles` (default `''`, "Off") overlays sibling series on the selected
metric without changing it. `boundaries` draws GPU Level Measured, All in Measured IT (no PUE)
and All in Measured; `provisioned` (the PowerX Rated boundaries toggle) draws GPU Level
Measured and All in Provisioned only; `all` (share links only) adds both provisioned bounds
to the measured three. `i_pcompare=breakdown` is the PowerX
Where the power goes view (per-chip stacks at one interactivity) and overlays nothing. `utils/power-compare.ts` is the single source: `useChartData` and
the `?unofficialrun=` processor (`processOverlayChartDataWithClipping`) both call
`expandPowerCompareSeries`, which appends one clone per sibling to every base point — same
`x`, `y` taken from the sibling's field, `powerVariant` set — and leaves the base points
untouched, so a chart without a comparison is byte-identical to before. A point lacking a
sibling's value contributes nothing to that series (never a 0), so each boundary's and
role's availability rules carry through unchanged.

## Power timeline (Display → Timeline)

`y_measuredPowerTimeline` is the third value of the Measured Power **Display** control
(`watts` / `tdp` / `timeline`, `MeasuredPowerDisplay` in `measured-metric-config.ts`). Its
registry field aliases `measuredAvgPower`, so the point set, the Table view and the share link
are those of the measured average; only the chart body changes:
`ChartDisplay` renders `ui/PowerTimeline.tsx` instead of `ScatterGraph` when the resolved
config is `display: 'timeline'`.

- **Join.** Each validated row's `power_audit.source` is `power_validation_<name>.json`.
  Two collectors publish the telemetry behind it (`utils/powerTimeline.ts`):
  - single-node runners upload one `gpu_metrics_<name>` CSV artifact per config
    (`benchmark-tmpl.yml`), so the source names the artifact exactly
    (`telemetryArtifactForPoint`);
  - Slurm / Dynamo disaggregated runners upload one `power_audit_<RESULT_FILENAME>` bundle per
    concurrency sweep. The API cuts it into one series per `power_validation_*.json` the bundle
    contains (`components/gpu-power/power-audit-bundle.ts`) and labels each with that file name
    in `series.source`, which `joinPowerTimeline` matches before falling back to the artifact
    name.

  Nothing is matched by hardware or concurrency. Rows whose telemetry is missing (expired
  artifact, bundle over the download cap, another collector) are not drawn, never
  estimated. Trace keys are
  `<runId>:<name>` (`traceKeyForPoint`), unique per point in both collectors.

- **Fetch.** One request per workflow run in the visible points
  (`planPowerTimelineRequests`, at most `POWER_TIMELINE_MAX_RUNS`; a deep-linked trace's run
  goes first, then runs holding a point the legend shows (`?unofficialrun=` overlay runs before
  official ones), then runs whose points are all hidden — `prioritizeRun` / `prioritizeRuns` — so
  an overlay the user asked for, or a pair left visible for comparison, is never the run that gets
  dropped),
  narrowed with
  `prefix=` to the common RESULT_FILENAME prefix so a nightly sweep's other models are not
  downloaded. `/api/gpu-metrics?series=power` first uses persisted telemetry and returns one-second per-GPU buckets
  (`components/gpu-power/power-series.ts`, ~1 MB for a 25-config run instead of ~27 MB of
  raw rows). Missing stored telemetry falls back to artifacts; database failures are explicit errors.
  See [PowerX telemetry storage](./data-pipeline.md#powerx-telemetry-storage-gpu_metric_-migration-016)
  for cache freshness, coverage and targeted repair.
  Runner timestamps are UTC wall clock and are parsed as such
  (`parseTelemetryTimestampUtc`); `new Date('2026/09/12 20:19:57')` would read browser local
  time and misplace the audit window.
- **Legend with overlays.** Once `?unofficialrun=` data is in, the chart reads
  `localOfficialOverride`, so the timeline legend writes the unified selection
  (`setUnifiedOverlaySelection`, `computeToggle` solo semantics) exactly as `ScatterGraph`
  does; the context's `toggleHwType` alone would change nothing visible there.

## Analysis panels

The role and system power breakdown panels on the PowerX tab's Where the power goes view live in
`ui/PowerAnalysisPanels.tsx`. Their read-only API fields (`rolePoints`, `powerBreakdowns`), the
API-only power fit (`powerFits`) and the API-only equal-service comparisons are described in the
[dashboard views reference](../packages/skills/skills/inferencex-api/references/dashboard-views.md).

The breakdown panel (`ui/PowerBreakdownPanel.tsx`, share parameter `i_pbview=area|bars`, stacked
area by default) draws one hardware line at a time, grouped exactly like the scatter legend
(`hwKey` + precision); the vendor color marks the Hardware select dot, the area's top edge and its
total dots. The x-axis is the chart's own interactivity
axis (including the AgentX P90/P75 trace-derived axes), or median interactivity when the chart
plots something else; points sit in evenly spaced slots labelled with their interactivity, so
a sweep's points bunched at low interactivity stay readable. Each point gets a
stacked bar, or a point on a stacked area, of its All in Measured W/GPU split by
`deploymentBreakdownWatts` (see [system power](./powerx-system-power.md#per-point-breakdown)).
The plot draws six layers, not twelve parts (`POWER_BANDS` and `powerBandsOf` in
`utils/power-breakdown.ts`, in stack order): Measured GPU (`gpu`), Measured Grace CPU
(`measuredCpu`, NVL72 with socket telemetry only), Server parts (`cpu`, `memory`, `nic`,
`nvswitch`, `storage`, `other`), Fans + PSU loss (`fans`, `psuLoss`), Network share (`network`)
and Facility overhead (`facility`, only when the facility is counted); an empty layer is left
out. Layers step down in opacity of the hardware color like the Profit Estimator's stacked
bars (`POWER_BAND_OPACITY`: 0.9, 0.72, 0.5, 0.34, 0.2, hatch tint 0.18), and every modeled
layer is hatched at its own stripe angle (`HATCH_ANGLE`: 45°, 135°, vertical, horizontal for
the facility) like its loss segment, while measured layers are solid; the chip comparison's
legend repeats each layer's swatch with Measured or Modeled. The per-column tooltip lists the
layers top first with their subtotal in bold, and the parts of a layer that folds several
(Server parts, Fans + PSU loss) under it. The per-component detail lives in the parts list
(`ui/PowerPartsList.tsx`) beside the plot (under it below `lg`): one row per non-empty part of
the chip at the compared point, heaviest first and the facility overhead last under a rule,
with a bar in its layer's tint (dashed left edge when modeled), the watts, the share of IT
(the facility row: its share of the facility total) and a 72×18 sparkline of that part across
the chip's points on its own 0..max scale, the compared point dotted. The row's `title` says
Measured, Modeled · fixed or Modeled · moves with load (`POWER_PART_BEHAVIOUR`, pinned by
`system-power-model.test.ts`). Hovering a layer, a legend row or a list row raises that layer
(its step and hatch stay, its edge thickens) and fades the others to 0.25
(`usePowerLayerHighlight`, a layer target or a part target that carries its layer); a click
pins, Escape or a click on the plot unpins. Measured sits at the bottom; the chip comparison's
segments are the same six layers on each chip's colour (a folded layer's `title` lists its
parts) and share the highlight. The list follows the slider and the Hardware select exactly as
the plot's dashed outline does; a column click pins that chip's compared point for the row,
the outline and the list (`i_pbpoint`, see [PowerX layout](#powerx-layout)) without moving the
slider. Unofficial-run series take the run colour (`overlayRunColor`)
for the layers, the hatches, the list and the sparklines. TDP and All in Provisioned are
dashed reference lines, not stacked values. Bar width comes from the room to the neighboring
points and carries no data; the concurrency label sits above each total and both are hidden
when bars are too close to read.
