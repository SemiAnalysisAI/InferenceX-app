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
(`POWER_BASIS_METRIC_CONFIG_KEYS` is spread into it) so they inherit exactly this behaviour.

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
`metricKey in point`).

The chart caption (`data-testid="power-basis-assumptions"`) names the boundary, the formula in
words, the PUE constant and the chassis-model revision so a screenshot records its method.
The pinned tooltip's "Modeled system power" block (`tooltipUtils.ts` `modeledSystemPowerHTML`)
renders only for `measured*` keys and `y_modeledChassisPowerPerGpu`, so on the boundary keys the
caption is the only per-chart provenance; the caption does not promise more.
When no point in the selection reports the selected telemetry axis, the chart's empty state says
the selection has no measured GPU power (`noMeasuredDataHint`) instead of the generic hint.

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

Pinned official dashboard points now offer **View PowerX** when the feature gate is unlocked
or a measured-metric share link is active. The lazy in-page dialog reads the existing
`GET /api/v1/gpu-metrics-point?id=N` API, without entering a run ID or changing chart filters.
This also works in the hardware/date comparison view. The per-chip chart and statistics span
the recorded job (including startup/warmup), not just the audited serving window. Fixed-sequence
points do not request AgentX server-metric overlays. Missing telemetry is shown as unavailable,
not zero power. Unofficial points have no database ID and retain **View power trace**, which
resolves their run/audit provenance automatically. No API contract or ingestion changes are
needed for this presentation-only entry point.

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
`powerCompareVariants` returns nothing and the Compare select disables the option. A link that
arrives with an inapplicable mode keeps the parameter, so switching back to an applicable
setting resumes it.

Rendering (`ScatterGraph`): the series key is `scatterSeriesKey(point)` =
`<hwKey>_<precision>[-v-<variant>]` (`utils/point-identity.ts`), so rooflines, frontiers,
Optimal Only, line labels, overflow continuations and the perf ruler treat each sibling as its
own series; `parseScatterSeriesKey` recovers hardware, precision and variant wherever the key
was previously split on `_`. Siblings keep the hardware colour (overlay runs keep the run
colour) and take a per-variant `stroke-dasharray` (`powerVariantDash`); clone points render
at 0.6 opacity behind their base and carry `data-power-variant`. Line labels are placed per
hardware _and_ sibling: the base series keeps its plain hardware label, while a sibling appends
` · <short name>` (`powerLineLabelSuffix`: TDP, All-in, PUE modeled, Prefill GPUs, …) and, when a
boundary is flat on a watts axis, its shared value (`B300 (SGLang) · TDP 1.2 kW`), so an exported
PNG explains its dashed lines without the legend; each pill carries `data-series-id`
(`<hw>::<variant>` for a sibling) and `data-power-variant`. The legend appends one
line-swatch row per series present (base first); rows toggle chart-local visibility
(`hiddenPowerVariants`, not in the URL) and hover-highlight that series across every hardware.
`scatterPointConfigId` includes the variant so a clone never replaces its base in a D3 join.
Tooltips add a "Series" line; on the energy axis a role clone also reports its share of the
reconstructed request energy. Table adds a "Series" column and CSV a trailing "Power Series"
column only while clones are present. Comparison clones are excluded from `bestSeriesPerSku`,
the legend points table and the date-comparison `GPUGraph`. Unofficial-run pills read `✕ <hardware>` (`getOverlayLineLabel`); the branch stays in the
legend and a short run tag (` · main`, ` · …<date>-<sha>`) is appended only when several overlay
runs draw the same hardware.

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
    concurrency sweep whose `LOGS/power/samples.csv` (DCGM, `<hostname>/<GPU-uuid>` per device)
    covers every concurrency. The API cuts it into one series per `power_validation_*.json` the
    bundle contains (`components/gpu-power/power-audit-bundle.ts`: the validation file's
    `selected_window` ± 60 s, roles from its `per_gpu_role`, manifest `expected_devices` as the
    fallback) and labels each with that file name in `series.source`, which `joinPowerTimeline`
    matches before falling back to the artifact name.

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
  See [persistence and repair](./powerx-persistence-recovery.md) for cache freshness and coverage receipts.
  With `series=power` the artifact fallback also downloads `power_audit_*` bundles whose name
  shares the prefix (a bundle names the sweep, so the match runs both ways), reads only
  `LOGS/power/samples.csv`, `LOGS/power/manifest.json` and the top-level
  `power_validation_*.json` entries, and skips bundles above 256 MiB (the GB200 nw8 sweep is
  215 MB). A bundle-cut series carries `source` and `devices[] { id, role? }`; CSV series carry
  neither. Runner timestamps are UTC wall clock and are parsed as such
  (`parseTelemetryTimestampUtc`); `new Date('2026/09/12 20:19:57')` would read browser local
  time and misplace the audit window.
- **Legend with overlays.** Once `?unofficialrun=` data is in, the chart reads
  `localOfficialOverride`, so the timeline legend writes the unified selection
  (`setUnifiedOverlaySelection`, `computeToggle` solo semantics) exactly as `ScatterGraph`
  does; the context's `toggleHwType` alone would change nothing visible there.

- **Drawing.** One trace per config, mean of its GPUs (legend switch: one line per GPU),
  coloured by hardware for official rows and by `overlayRunColor(runIndex)` for
  `?unofficialrun=` rows; legend toggles follow `activeHwTypes` / `activeOverlayHwTypes`
  exactly as in `ScatterGraph`. The whole job is drawn faint and the `power_audit` window
  emphasized (`data-segment="full" | "window"`). Rated TDP is a dashed reference per hardware;
  the all-in provisioned line is an opt-in legend switch because it halves the traces'
  vertical resolution. X axis: wall clock (UTC) when the visible traces come from one run,
  otherwise seconds since each trace's start; both are a toolbar toggle. `c<conc>` labels sit
  at the end of the emphasized segment; labels that would overprint stack one row apart
  (`stackTraceLabels`).
- **Pools (Figure 1).** The legend switch _Prefill / decode pools_ (shown when a visible
  trace carries worker roles) sums the board power of each role's GPUs
  (`tracePools` / `sumPowerAt`) and draws one line per pool — prefill dashed `7 3`, decode
  `2 3`, the same dashes as the `i_pcompare=roles` series — labelled `c<conc> · prefill` /
  `· decode`, on a _GPU pool power (W)_ axis. Traces without roles draw their deployment total
  as one `all` line so single-node configs stay comparable. Reference lines become pool size ×
  rated TDP per (hardware, pool size): roles of one hardware that hold the same GPU count share
  one line labelled `prefill / decode ×16` (`data-pool` on `.power-reference` lists the roles,
  `groupPoolsBySize`), and labels of lines at equal watts stack upward (`referenceLabelSlots`)
  instead of overprinting; and the
  all-in switch scales the same way. The tooltip names the pool, its summed watts against the
  pool TDP, and the mean / min / max per GPU inside it. Pool mode and per-GPU lines are
  mutually exclusive.
- **Deep link.** A pinned scatter tooltip on any metric of the measured family offers _View
  power trace_ (`data-action="view-power-trace"`, official and `?unofficialrun=` points
  alike). It switches the Display to Timeline in place and records the point's trace key in a
  one-shot module store (`requestPowerTraceFocus`); the timeline consumes it on mount, dims
  every other trace, switches to pool mode when the trace has roles, and shows a _Focused on …_
  chip (`data-testid="power-timeline-focus"`) with _Show all_ to clear. The link's `href` is
  the current page with `i_metric=y_measuredPowerTimeline` only, so open-in-new-tab lands on
  the unfocused timeline; once the focus is applied it is written to `i_ptfocus` like the other
  timeline settings.
- **Same load across platforms.** The toolbar _Concurrency_ select (`i_ptconc`, default all)
  keeps the chart's rows at one load, so, for example, GB200 and GB300 prefill/decode pools draw
  side by side; `i_ptaxis=serving` aligns them at each validated window's start. With two or
  more hardware types visible, every line label leads with the hardware label. A deep link
  resets the filter so the focused trace is never filtered out.
- **Validated-window summary.** `ui/PowerTimelineSummary.tsx` lists each drawn trace's
  hardware and config, run link, attempt, validation file, per-run telemetry source
  (`database`, or `GitHub artifact fallback` when `/api/gpu-metrics` read any requested series
  live) and window length. Per pool (all GPUs, prefill, decode) it shows the GPU count, the
  row's validated average W/GPU as stored, the largest drawn 1-s pool sum inside the window
  (`summarizeTraceWindow`) and pool TDP = GPUs × `HW_REGISTRY.tdp`. No average is recomputed.
- **State.** Axis mode (`i_ptaxis`), line mode (`i_ptlines`: mean / `gpu` / `pool`), window-only
  display (`i_ptwindow`), the focused trace (`i_ptfocus`), the all-in switch (`i_ptutility`) and
  the concurrency filter (`i_ptconc`) are `PowerTimeline` component state mirrored into the URL by the component itself
  (`parsePowerTimelineParams` on mount, `setUrlParams` on change); defaults serialize as `''`.
  Hover highlight is never shared. See
  [Dashboard read-only views](./dashboard-readonly-views.md) for the renderer-only status of
  these fields against the raw `gpu-metrics` API.
- **Analytics.** `inference_power_timeline_loaded { traces, missing, runs }`,
  `inference_power_timeline_axis_changed { mode }`,
  `inference_power_timeline_lines_changed { lines: 'mean' | 'gpu' | 'pool' }`,
  `inference_power_timeline_utility_toggled { enabled }`,
  `inference_power_timeline_concurrency_changed { concurrency }`,
  `inference_power_trace_opened { hwKey, conc, overlay }` (scatter tooltip action),
  `inference_power_timeline_focus_cleared`.

## Analysis panels (article figures 6–16)

Figure numbers here follow the current article draft; the share-link table above predates its
renumbering. Below the measured chart, `ui/PowerServiceComparison.tsx` offers three opt-in
panels, and the scatter chart adds a fourth. All read the chart's scoped observed points
(`observedPoints`: official and `?unofficialrun=` rows, comparison clones excluded), keep one
source per exact run and recipe (`equalServiceSourceKey`), and colour overlay sources with
`overlayRunColor`.

| Figures      | Panel                                                                                                                                         | Switch (share param)                                                                                    | Helper                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 6 / 7 / 9    | Same-concurrency table: baseline and comparator J/output token, W/GPU and streaming speed, with % change                                      | _Compare at the same speed / latency_ (`i_servicecompare=1`, sources `i_servicebase` / `i_servicepeer`) | `utils/matched-concurrency.ts`                         |
| 12 / 13 / 14 | Role group: W/GPU by role, role-local J/input and J/output (not added), J/output token by role with the total, prefill share                  | _Prefill / decode roles_ (`i_roleshare=1`)                                                              | `getRolePoints` in `utils/equal-service-comparison.ts` |
| 15           | Least-squares fit of mean W/GPU against output tok/s per allocated GPU: points, line, dashed extension to zero, P₀, P₀ ÷ TDP, m, R², n, range | _Power vs output-rate fit_ (`i_powerfit=1`)                                                             | `utils/power-fit.ts`                                   |
| 16           | Frontier points: the drawn cross-platform frontier and each point's run and attempt                                                           | Legend _Pareto frontier_ (`i_frontier`) on a measured metric                                            | `utils/frontier-points.ts`                             |

- **Same concurrency** pairs only observations; nothing is interpolated. A side missing at a
  load reads _Not measured_. Disagreeing duplicates of one source read as ambiguous, with none
  chosen. % change needs both sides. Same load usually means different speed, so the table
  sits beside the equal-service comparison, not in place of it.
- **Roles** use validated disaggregated rows. Each panel names its denominator. Missing role
  telemetry is omitted, never drawn as zero, and share points stay unconnected.
- **Fit** needs three distinct output rates per source. Output is whole-deployment tok/s over
  all allocated GPUs, on the same basis as the mean W/GPU. P₀ is an extrapolated intercept,
  not measured idle power, and R² describes only that line.
- **Frontier** lists `globalParetoFrontier`'s own output, so the table is exactly what is
  drawn. Ties keep the first point, official before overlay.
- **Source labels** (`getEqualServiceSources`) read hardware and date, adding precision,
  topology, run, attempt, recipe, image or point only where two sources would otherwise look
  the same. The opaque key stays the exact identity.
- Plots export PNG and CSV; the frontier table exports CSV only. The views API returns
  `matchedConcurrency`, `rolePoints` and `powerFits`
  ([Dashboard read-only views](./dashboard-readonly-views.md#fixed-sequence-service-comparisons));
  it has no global-frontier parameter.
- Analytics: `inference_equal_service_toggled`, `inference_power_roles_toggled` and
  `inference_power_fit_toggled` (`{ enabled }`), `inference_equal_service_source_changed
{ role }`, and chart-button events under `matched_concurrency`, `power_roles`, `power_fit`
  and `frontier_points`.

## Tests

- `lib/power-basis.test.ts` and `lib/chart-utils.test.ts` — the six boundary values through
  the real builder, and the same fields on `?unofficialrun=` overlay rows.
- `gpu-power/power-series.test.ts`, `power-audit-bundle.test.ts` — one-second buckets with
  `null` gaps, a partial pool is a gap rather than a lower sum, and bundle rows stay on their
  host/device and role inside the padded window.
- `utils/powerTimeline.test.ts` — overlay runs are fetched ahead of official runs.
- `api/gpu-metrics/route*.test.ts` — the stored digest shape, DB-first serving, database
  failure as 503, known missing hosts, and the retained-inventory recount before a CSV
  fallback.
- `cypress/component/power-timeline.cy.tsx`, `power-compare.cy.tsx` — overlay-run colour and
  the overlay hardware filter.
- `utils/matched-concurrency.test.ts`, `utils/power-fit.test.ts`, `utils/powerTimeline.test.ts`
  — signed same-concurrency deltas, the least-squares fit and R², disaggregated fits on output
  per allocated GPU, and the peak pool power inside the validated window.
- `cypress/component/power-service-comparison.cy.tsx`, `frontier-points-panel.cy.tsx`,
  `power-timeline.cy.tsx` and `cypress/e2e/powerx-compare.cy.ts` — the article panels on
  `?unofficialrun=` overlay rows.
