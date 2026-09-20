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

The Measured Energy group is `gated: true` in `metric-registry.ts`. `ChartControls` hides a
gated group while the gate is locked unless the selected `i_metric` belongs to it, so a
shared link to any boundary renders for a reader who never unlocked the gate, while the
group stays out of the selector otherwise. The boundary metrics are members of that group
(`POWER_BASIS_METRIC_CONFIG_KEYS` is spread into it) so they inherit exactly this behaviour;
Cypress `powerx-basis.cy.ts` covers the locked, unlocked and shared-link cases.

## Boundaries

| Basis (`PowerBasis`)  | Selector label               | W / GPU metric                               | J / output token metric                           | Source                                                                  |
| --------------------- | ---------------------------- | -------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `gpu-measured`        | GPU measured                 | `y_measuredAvgPower` (+P75/P90, roles, %TDP) | `y_measuredJPerOutputToken` (+ input/total/query) | runner telemetry; existing metrics, unchanged                           |
| `gpu-provisioned`     | GPU provisioned (TDP)        | `y_gpuProvisionedWatts`                      | `y_gpuProvisionedJPerOutputToken`                 | `HW_REGISTRY.tdp`                                                       |
| `utility-provisioned` | Utility provisioned (all-in) | `y_utilityProvisionedWatts`                  | `y_utilityProvisionedJPerOutputToken`             | `HW_REGISTRY.power` (all-in kW per GPU)                                 |
| `utility-modeled`     | Utility modeled (PUE)        | `y_utilityModeledWatts`                      | `y_utilityModeledJPerOutputToken`                 | `modelSystemPower` chassis AC × PUE 1.3 (applied once), ÷ measured GPUs |

Formulas, the all-GPU normalization (`N_alloc` = prefill + decode GPUs for disaggregated
rows) and the null rules are specified in
[Data Transforms → Power boundaries](./data-transforms.md#power-boundaries); the chassis model
itself in [PowerX System Power](./powerx-system-power.md). The ungated `jOutput` keeps its
per-decode-GPU normalization; its labels and the boundary metric's `all GPUs` label keep the
two distinguishable in the selector, the availability list and CSV headers.

Every boundary metric has `polarity: 'lower'`. Energy metrics therefore get the usual
lower-is-better Pareto frontier. The three watt keys are listed in `POWER_CURVE_METRICS`
(`utils/powerCurves.ts`), so `ScatterGraph`/`GPUGraph` draw the upper power envelope for them
exactly as for `y_measuredAvgPower`, and Optimal Only keeps every load point; the declared
`lower_*` roofline only drives the ascending Table sort. They stay out of
`isMeasuredPowerCurveMetric`, like `y_modeledChassisPowerPerGpu`, so telemetry-only decorations
do not apply. `measured-power-direction.test.ts` pins both halves. A flat provisioned series
(TDP or all-in W is one constant per hardware) has a single envelope vertex per hardware, so no
envelope line is drawn for it — only the points.

## Why the metric key carries the boundary

There is no `i_pbasis` URL parameter. The Boundary select in `MeasuredMetricControls` is
presentation over `selectedYAxisMetric`, exactly like Per / Scope / Statistic / Display /
Unit: `measured-metric-config.ts` gives every Measured Energy key a `basis` and resolves each
control change to the nearest registered key. Consequences:

- One share link per figure, and `i_metric` already round-trips through every existing
  surface (share button, Historical Trends hand-off, Table, CSV header).
- Existing links are byte-identical: all `measured*` keys carry `basis: 'gpu-measured'`, and
  `MEASURED_METRIC_DEFAULTS` did not change.
- Choosing a derived boundary snaps to its canonical combination (whole deployment, average
  watts, joules per output token). Changing any telemetry-only setting while on a derived
  boundary returns to GPU measured, so no control ever points at a key that does not exist.
- A gated metric selected through a shared URL keeps its Measured controls, as the
  `measured*` siblings already do.
- The Y-axis dropdown's collapsed "Measured Power" / "Measured Energy" option for the other
  family resolves to `MEASURED_METRIC_DEFAULTS[family]` (GPU measured), so switching family
  from the dropdown resets the boundary; the resolver itself keeps `basis` on a family change
  (`changeMeasuredMetricConfig(key, { family })`), which is what a future family control in
  the Measured row should call.

The Boundary select tracks `inference_power_basis_changed { basis, family }` in addition to the
existing `inference_y_axis_metric_selected` fired by `ChartControls`.

## Missing values

A point without a value for the selected boundary is omitted from that series only (the
builders never emit `{ y: 0 }`, and both the official and overlay paths filter by
`metricKey in point`). The PowerX availability panel explains the gap per point:

| State              | Meaning                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noSpec`           | hardware has no `tdp` / `power` in `HW_REGISTRY`                                                                                                         |
| `noThroughput`     | provisioned watts exist but the row has no output throughput                                                                                             |
| `noNormalization`  | disaggregated row with throughput but no whole-deployment GPU count (`powerBasisNormalization`: not `single_turn`, or non-integer prefill/decode counts) |
| `noTelemetry`      | modeled boundary needs validated GPU telemetry (B4 follows B1)                                                                                           |
| `invalid`          | `power_valid === 0`                                                                                                                                      |
| `modelWorkload`    | chassis model covers 8K / 1K only                                                                                                                        |
| `modelHardware`    | hardware outside the chassis profiles (GB200 / GB300 NVL72)                                                                                              |
| `modelUnsupported` | other `modelSystemPower` reasons (gpu-count, topology, role-power …)                                                                                     |

The chart caption (`data-testid="power-basis-assumptions"`) names the boundary, the formula in
words, the PUE constant and the chassis-model revision so a screenshot records its method.
The pinned tooltip's "Modeled system power" block (`tooltipUtils.ts` `modeledSystemPowerHTML`)
renders only for `measured*` keys and `y_modeledChassisPowerPerGpu`, so on the boundary keys the
caption is the only per-chart provenance; the caption does not promise more.
The empty state for the utility-modeled boundary says why nothing rendered and points at the
Boundary select.

## Article figure → share link

Base: `/inference?g_model=<model>&i_seq=8k/1k&i_prec=<precision>` plus the hardware legend
selection. Append:

| Figure | Content                                       | Parameters                                                                                                                                                               |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2      | H200 W/GPU, all four boundaries on one chart  | `&i_metric=y_measuredAvgPower&i_pcompare=boundaries` (one boundary at a time: `&i_metric=y_gpuProvisionedWatts` / `y_utilityProvisionedWatts` / `y_utilityModeledWatts`) |
| 3      | H200 J/output token, all four boundaries      | `&i_metric=y_measuredJPerOutputToken&i_pcompare=boundaries` (single boundary: the matching `…JPerOutputToken` key)                                                       |
| 4 / 5  | B200 vs B300, GB200 vs GB300 at fixed X       | `&i_metric=<measured key>&i_rulers=<x>` (Perf Ruler, T1)                                                                                                                 |
| 6      | Prefill vs decode W/GPU with the whole deploy | `&i_metric=y_measuredAvgPower&i_pcompare=roles`                                                                                                                          |
| 7      | Reconstructed request energy, prefill share   | `&i_metric=y_measuredJPerOutputToken&i_pcompare=roles` (prefill share in the clone's tooltip)                                                                            |
| 1      | Measured power over the benchmark job         | `&i_metric=y_measuredPowerTimeline` (Display → Timeline, see below)                                                                                                      |

The `/gpu-metrics` page keeps the raw per-run explorer (every metric, one artifact at a time);
the timeline below is the chart-scoped view of the same artifacts.

## Comparison series (`i_pcompare`)

`i_pcompare=boundaries|roles` (default `''`, "Off") overlays sibling series on the selected
metric without changing it. `utils/power-compare.ts` is the single source: `useChartData` and
the `?unofficialrun=` processor (`processOverlayChartDataWithClipping`) both call
`expandPowerCompareSeries`, which appends one clone per sibling to every base point — same
`x`, `y` taken from the sibling's field, `powerVariant` set — and leaves the base points
untouched, so a chart without a comparison is byte-identical to before. A point lacking a
sibling's value contributes nothing to that series (never a 0), so each boundary's and
role's availability rules carry through unchanged.

| Mode         | Base series                                       | Siblings                   | Fields                                                                                                                                                                               |
| ------------ | ------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `boundaries` | the selected boundary (`basis` of the metric key) | the other three boundaries | `measuredAvgPower` / `POWER_BASIS_FIELDS[*].watts`, or `measuredJPerOutputToken` / `POWER_BASIS_FIELDS[*].energy`                                                                    |
| `roles`      | the selected scope (`all`, `prefill`, `decode`)   | the other two worker pools | W: `measuredAvgPower`, `measuredPrefillAvgPower`, `measuredDecodeAvgPower`; J/out: `measuredJPerOutputToken`, `reconstructedPrefillJPerOutputToken`, `measuredDecodeJPerOutputToken` |

Siblings exist only where the metric names the whole-deployment **average W/chip** or **J per
output token** (the only quantities every boundary and role publishes on one axis); role
energy additionally excludes the prefill J per input token scope. Elsewhere
`powerCompareVariants` returns nothing, the Compare select disables the option, and — when a
link arrives with an inapplicable mode — a hint (`measured-compare-hint`) says the comparison is
paused. The parameter is kept, so switching back to an applicable setting resumes it.

Rendering (`ScatterGraph`): the series key is `scatterSeriesKey(point)` =
`<hwKey>_<precision>[-v-<variant>]` (`utils/point-identity.ts`), so rooflines, frontiers,
Optimal Only, line labels, overflow continuations and the perf ruler treat each sibling as its
own series; `parseScatterSeriesKey` recovers hardware, precision and variant wherever the key
was previously split on `_`. Siblings keep the hardware colour (overlay runs keep the run
colour) and take a per-variant `stroke-dasharray` (`powerVariantDash`); clone points render
at 0.6 opacity behind their base and carry `data-power-variant`. Line labels are placed per
hardware _and_ sibling: the base series keeps its plain hardware label, while a sibling appends
` · <short name>` (`powerLineLabel`: TDP, All-in, PUE modeled, Prefill GPUs, …) and, when a
boundary is flat on a watts axis, its shared value (`B300 (SGLang) · TDP 1.2 kW`), so an exported
PNG explains its dashed lines without the legend; each pill carries `data-series-id`
(`<hw>::<variant>` for a sibling) and `data-power-variant`. The legend appends one
line-swatch row per series present (base first); rows toggle chart-local visibility
(`hiddenPowerVariants`, not in the URL) and hover-highlight that series across every hardware.
`scatterPointConfigId` includes the variant so a clone never replaces its base in a D3 join.
Tooltips add a "Series" line; on the energy axis a role clone also reports its share of the
reconstructed request energy. Table adds a "Series" column and CSV a trailing "Power Series"
column only while clones are present. Comparison clones are excluded from `bestSeriesPerSku`,
the power-tier counts, the legend points table, the availability panel (which reads
`selectionPoints`) and the date-comparison `GPUGraph`.

Figure 7's reconstruction lives in `utils/role-energy.ts`: schema-2 aggregate energy has one
numerator, so `J/out ÷ J/in` is the served input:output token ratio and
`prefill_joules_per_input_token × (J/out ÷ J/in)` is the prefill pool's energy per output
token; with `decode_joules_per_output_token` it sums back to the deployment's J/out when the
pool energies partition the total. `buildDerivedChartFields` emits it as
`reconstructedPrefillJPerOutputToken` for validated (`power_valid === 1`, schema 2)
disaggregated rows only; it is never a y-axis of its own.

The Compare select tracks `inference_power_compare_changed { mode, family }`; legend rows
track `inference_power_compare_series_toggled { series, visible }`.

## Power timeline (Display → Timeline)

`y_measuredPowerTimeline` is the third value of the Measured Power **Display** control
(`watts` / `tdp` / `timeline`, `MeasuredPowerDisplay` in `measured-metric-config.ts`). Its
registry field aliases `measuredAvgPower`, so the point set, the availability panel, the Table
view and the share link are those of the measured average; only the chart body changes:
`ChartDisplay` renders `ui/PowerTimeline.tsx` instead of `ScatterGraph` when the resolved
config is `display: 'timeline'`.

- **Join.** Each validated row's `power_audit.source` is `power_validation_<name>.json`.
  Two collectors publish the telemetry behind it (`utils/powerTimeline.ts`):
  - single-node runners upload one `gpu_metrics_<name>` CSV artifact per config
    (`benchmark-tmpl.yml`), so the source names the artifact exactly
    (`telemetryArtifactForPoint`);
  - Slurm / Dynamo disaggregated runners upload one `power_audit_<RESULT_FILENAME>` bundle per
    concurrency sweep whose `LOGS/power/samples.csv` (DCGM, `<hostname>/<GPU-uuid>` per device)
    covers every concurrency. The API cuts it into one series per `power_validation_*.json` the
    bundle contains (`components/gpu-power/power-audit-bundle.ts`: the validation file's
    `selected_window` ± 60 s, roles from its `per_gpu_role`, manifest `expected_devices` as the
    fallback) and labels each with that file name in `series.source`, which `joinPowerTimeline`
    matches before falling back to the artifact name.

  Nothing is matched by hardware or concurrency. Rows whose telemetry is missing (expired
  artifact, bundle over the download cap, another collector) are listed under the chart
  (`data-testid="power-timeline-missing"`), never estimated. Trace keys are
  `<runId>:<name>` (`traceKeyForPoint`), unique per point in both collectors.

- **Fetch.** One request per workflow run in the visible points
  (`planPowerTimelineRequests`, at most `POWER_TIMELINE_MAX_RUNS`; a deep-linked trace's run
  goes first, then `?unofficialrun=` overlay runs, then official runs — `prioritizeRun` /
  `prioritizeRuns` — so an overlay the user asked for is never the run that gets dropped),
  narrowed with
  `prefix=` to the common RESULT_FILENAME prefix so a nightly sweep's other models are not
  downloaded. `/api/gpu-metrics?series=power` returns one-second per-GPU buckets
  (`components/gpu-power/power-series.ts`, ~1 MB for a 25-config run instead of ~27 MB of
  raw rows); with `series=power` the route also downloads `power_audit_*` bundles whose name
  shares the prefix (a bundle names the sweep, so the match runs both ways), reads only
  `LOGS/power/samples.csv`, `LOGS/power/manifest.json` and the top-level
  `power_validation_*.json` entries, and skips bundles above 256 MiB (the GB200 nw8 sweep is
  215 MB). A bundle-cut series carries `source` and `devices[] { id, role? }`; CSV series carry
  neither. Runner timestamps are UTC wall clock and are parsed as such
  (`parseTelemetryTimestampUtc`); `new Date('2026/09/12 20:19:57')` would read browser local
  time and misplace the audit window.
- **Drawing.** One trace per config, mean of its GPUs (legend switch: one line per GPU),
  coloured by hardware for official rows and by `overlayRunColor(runIndex)` for
  `?unofficialrun=` rows; legend toggles follow `activeHwTypes` / `activeOverlayHwTypes`
  exactly as in `ScatterGraph`. The whole job is drawn faint and the `power_audit` window
  emphasized (`data-segment="full" | "window"`). Rated TDP is a dashed reference per hardware;
  the all-in provisioned line is an opt-in legend switch because it halves the traces'
  vertical resolution. X axis: wall clock (UTC) when the visible traces come from one run,
  otherwise seconds since each trace's start; both are a toolbar toggle. `c<conc>` labels sit
  at the end of the emphasized segment.
- **Pools (Figure 1).** The legend switch _Prefill / decode pools_ (shown when a visible
  trace carries worker roles) sums the board power of each role's GPUs
  (`tracePools` / `sumPowerAt`) and draws one line per pool — prefill dashed `7 3`, decode
  `2 3`, the same dashes as the `i_pcompare=roles` series — labelled `c<conc> · prefill` /
  `· decode`, on a _GPU pool power (W)_ axis. Traces without roles draw their deployment total
  as one `all` line so single-node configs stay comparable. Reference lines become pool size ×
  rated TDP per (hardware, role, pool size) (`data-pool` on `.power-reference`), and the
  all-in switch scales the same way. The tooltip names the pool, its summed watts against the
  pool TDP, and the mean / min / max per GPU inside it. Pool mode and per-GPU lines are
  mutually exclusive.
- **Deep link.** A pinned scatter tooltip on any metric of the measured family offers _View
  power trace_ (`data-action="view-power-trace"`, official and `?unofficialrun=` points
  alike). It switches the Display to Timeline in place and records the point's trace key in a
  one-shot module store (`requestPowerTraceFocus`); the timeline consumes it on mount, dims
  every other trace, switches to pool mode when the trace has roles, and shows a _Focused on …_
  chip (`data-testid="power-timeline-focus"`) with _Show all_ to clear. The link's `href` is
  the current page with `i_metric=y_measuredPowerTimeline`, so open-in-new-tab lands on the
  timeline (unfocused: the focus is a gesture, not URL state).
- **State.** Axis mode, line mode (mean / per GPU / pools), the all-in switch, the focused
  trace and hover highlight are component state, not URL state: the share link is `i_metric=y_measuredPowerTimeline` plus the usual
  scope, and a reader lands on the same defaults.
- **Analytics.** `inference_power_timeline_loaded { traces, missing, runs }`,
  `inference_power_timeline_axis_changed { mode }`,
  `inference_power_timeline_lines_changed { lines: 'mean' | 'gpu' | 'pool' }`,
  `inference_power_timeline_utility_toggled { enabled }`,
  `inference_power_trace_opened { hwKey, conc, overlay }` (scatter tooltip action),
  `inference_power_timeline_focus_cleared`.

## Tests

- `metric-registry.test.ts` — the six keys are in the gated group, resolve as themselves, are
  bilingual, are not `measured*` keys, and map 1:1 onto `POWER_BASIS_FIELDS`.
- `measured-metric-config.test.ts` — basis round-trips, snapping, return-to-measured, family
  switch.
- `measured-power-direction.test.ts` — watt keys share the measured corners and ascending
  table sort, are power-curve metrics (upper envelope keeps the dominated peak) but not
  measured-power-curve metrics; energy keys use the Pareto frontier and stay off the envelope.
- `cypress/component/power-metric-availability.cy.tsx` — per-point explanations (en/zh)
  including `noSpec`, `noNormalization`, `modelWorkload`, the overlay-aware count, and the
  measured dictionary staying separate from the boundary dictionary.
- `cypress/e2e/powerx-basis.cy.ts`, `measured-power-overlay.cy.ts` — control, URL, table,
  `/zh`, overlay run.
- `power-series.test.ts` — UTC timestamp parsing, one-second bucketing with `null` gaps, pool
  sums.
- `power-audit-bundle.test.ts` — cutting a DCGM bundle into per-validation series: window
  clipping, device order and roles (validation file, manifest fallback), malformed entries.
- `utils/powerTimeline.test.ts` — artifact-name and `source` joins, trace keys, per-run request
  planning with the common prefix, missing rows, window phases, role pools, the focus store.
- `api/gpu-metrics/route.test.ts` — `series=power` shape, `prefix=` narrowing the downloads
  (both ways for bundles), the bundle size cap, the raw shape ignoring bundles, 400s for
  malformed params.
- `cypress/component/power-timeline.cy.tsx` — traces, emphasized window, TDP / all-in
  references, per-GPU lines, pool lines with per-pool TDP, the focus chip, axis toggle,
  overlay-run colour and filter, failed run, `/zh`.
- `cypress/e2e/powerx-timeline.cy.ts` — Display → Timeline round trip through the share link,
  shared-link entry, Table view on the alias, `?unofficialrun=` overlay traces, _View power
  trace_ from a pinned tooltip (official and overlay), `/zh`.
