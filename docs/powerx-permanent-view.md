# PowerX Permanent View

How the PowerX article's power-boundary figures live inside `/inference` instead of a
separate page. The measured-power UI, the four power boundaries, and their share links all
sit in the existing ↑↑↓↓-gated **Measured Energy** metric group.

## Purpose

The article compares one deployment's power at four boundaries, from the GPU board to the
utility meter, both as W per GPU and as J per output token. The dashboard already had
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
- Choosing a derived boundary snaps to its canonical combination (whole deployment, average
  watts, joules per output token). Changing any telemetry-only setting while on a derived
  boundary returns to GPU measured, so no control ever points at a key that does not exist.
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

## Article figure → share link

Base: `/inference?g_model=<model>&i_seq=8k/1k&i_prec=<precision>` plus the hardware legend
selection. Append:

| Figure | Content                                       | Parameters                                                                                                                                                                                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2      | H200 W/GPU, measured boundaries + rated lines | `&i_metric=y_measuredAvgPower&i_pcompare=boundaries` draws GPU Level Measured and All in Measured; the rated lines are on the timeline (`&i_metric=y_measuredPowerTimeline`, all-in switch `&i_ptutility=1`) |
| 3      | H200 J/output token, all four boundaries      | `&i_metric=y_measuredJPerOutputToken&i_pcompare=boundaries` (single boundary: the matching `…JPerOutputToken` key)                                                                                           |
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

`i_pcompare=boundaries|roles` (default `''`, "Off") overlays sibling series on the selected
metric without changing it. `utils/power-compare.ts` is the single source: `useChartData` and
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

The opt-in role, power-fit and system power breakdown panels under the measured chart live in
`ui/PowerAnalysisPanels.tsx`. Their read-only API fields (`rolePoints`, `powerFits`,
`powerBreakdowns`) and the
API-only equal-service comparisons are described in the
[dashboard views reference](../packages/skills/skills/inferencex-api/references/dashboard-views.md).

The breakdown panel (`ui/PowerBreakdownPanel.tsx`, share parameters `i_powerbreakdown=1` and
`i_pbview=bars|area`) draws one hardware line at a time, grouped and colored exactly like the
scatter legend (`hwKey` + precision, vendor color). The x-axis is the chart's own interactivity
axis (including the AgentX P90/P75 trace-derived axes), or median interactivity when the chart
plots something else, so a bar sits where its point sits in the scatter. Each point gets a
stacked bar, or a point on a stacked area, of its All in Measured W/GPU split by
`deploymentBreakdownWatts` (see [system power](./powerx-system-power.md#per-point-breakdown)).
Parts step down in opacity of the hardware color, like the Profit Estimator's stacked bars, and
facility overhead is hatched. Measured parts sit at the bottom. TDP and All in Provisioned are
dashed reference lines, not stacked values. Bar width comes from the room to the neighboring
points and carries no data; the concurrency label sits above each total and both are hidden
when bars are too close to read.
