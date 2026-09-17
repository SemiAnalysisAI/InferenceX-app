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

| Figure | Content                                 | Parameters                                                                                                                                            |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2      | H200 W/GPU, one boundary at a time      | `&i_metric=y_measuredAvgPower` / `y_gpuProvisionedWatts` / `y_utilityProvisionedWatts` / `y_utilityModeledWatts`                                      |
| 3      | H200 J/output token, one boundary       | `&i_metric=y_measuredJPerOutputToken` / `y_gpuProvisionedJPerOutputToken` / `y_utilityProvisionedJPerOutputToken` / `y_utilityModeledJPerOutputToken` |
| 4 / 5  | B200 vs B300, GB200 vs GB300 at fixed X | `&i_metric=<measured key>&i_rulers=<x>` (Perf Ruler, T1)                                                                                              |

Figures 2 and 3 as a single chart with all four boundaries overlaid, and Figures 6 / 7
(prefill vs decode roles), wait for the `i_pcompare` overlay series (T4); until then each
boundary is one link. Figure 1 (power over time) stays on `/gpu-metrics`.

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
