# Dashboard read-only views

Use `/api/v1/views/*` for dashboard-calculated values. Read the deployed
[OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json) first:
these routes become available only after the corresponding app change deploys.
Do not assume an installed skill proves server availability.

## TCO basis

Use `tcoBasis=internal` (the default) or `tcoBasis=external` in cost-aware
read-only views. Qwen3.5 and Kimi K3 expose the corresponding dashboard toggle
on 8K/1K and Agentic Traces; inference charts show it for cost metrics when
TPUv7 data is visible. The API accepts the pricing basis independently of
control visibility. It changes configured ownership costs, not measured
throughput; explicit custom costs remain user-controlled.

## Historical editorial articles

The GLM-5.3 article at
`/blog/sparse-savings-persistent-demand-inside-glm53` (Chinese:
`/zh/blog/sparse-savings-persistent-demand-inside-glm53`) preserves the newsletter's
September 28, 2026 snapshot, original figures, and framework/TTFT qualifications.
Discover public article text through `/llms.txt` and `/llms-full.txt`; the
subscriber-only continuation is linked, not exposed by those feeds.
This is static editorial content, not a new view API. For fresh measurements use
the existing `inference`, `first-token`, and `cache-reuse` contracts below, with
explicit selectors. Do not replace the article's historical costs with current
results or treat its interpolated values as separately measured operating points.

## Capture and select

1. Resolve the view and missing selectors from the table below. Read `options`
   for static model, hardware, sequence and metric registries; use each specialized
   view's `options`, `configurations`, `workloads`, or raw run-list operation for
   data-dependent choices.
2. Build one public HTTPS GET URL using `URLSearchParams`, especially for JSON
   costs, commas, slashes, and run-specific comparison dates. No credentials are
   required. Unknown or repeated parameter names return 400.
3. Save the complete decoded response and capture sidecar using
   [public API capture](public-api-examples.md). Retain the resolved `params`,
   source run IDs, dates, pricing, missing values and omitted-point reasons.
4. Compare the returned selection with the request before interpreting values.
   A 204 video response means no published artifact is available; do not publish
   or ingest an artifact to satisfy a read request. HTTP errors are incomplete
   evidence, not an empty successful dataset.

These are raw API captures, outside the six formal CLI bundle families.
`inferencex verify` does not convert a view capture into a formal evidence bundle.
The inference dashboard resets manual legend selections and Best per SKU overrides
when the reader chooses a different model in the model selector; same-model axis
changes preserve manual selections. Initial
share links and explicit presets still apply their selections. View API requests
are stateless: omit `best` for the default ranking, or send `best=false` explicitly
for each model to retain all selected series. Do not infer a destination model's
default from a manual engine selection made on another model.

Best per SKU ranks only points in the selected precisions. For example,
`precisions=fp8&best=true` selects the best FP8 configuration per SKU; a faster
FP4 configuration cannot displace it. The dashboard applies the same scope to
both official and unofficial-overlay selections.

Qwen3.5 defaults to `xmode=e2e` and excludes MI300X, MI325X, H100, and H200
when `gpus` is omitted. An explicit `xmode` or `gpus` overrides its model default;
use `gpus=` to include all hardware.

Example URLs (check deployed availability before use):

```text
https://inferencex.semianalysis.com/api/v1/views/options
https://inferencex.semianalysis.com/api/v1/views/inference?model=DeepSeek-V4-Pro&sequence=agentic-traces&optimal=false&best=false
https://inferencex.semianalysis.com/api/v1/views/first-token?model=DeepSeek-V4-Pro&caps=2,5,10&minInteractivity=150
https://inferencex.semianalysis.com/api/v1/views/profit-estimator?model=DeepSeek-V4-Pro&priceSource=custom&inputPrice=1&cachedInputPrice=0.1&outputPrice=1
```

## Profit estimator defaults

Both views default `cacheHitMode` to `theoretical`, displayed as
“Theroticial Roofline” in English and Chinese dashboards. This uses the
trace-derived infinite-cache hit rate, falling back to the measured rate when
unavailable. Pass `cacheHitMode=actual` for measured cache behavior; dashboard
links preserve that choice as `/cache-hit-mode/actual`. Report the resolved
`params.cacheHitMode` alongside the pricing assumptions.

Both profit views default DeepSeek V4 Pro to `target=35` tok/s/user when
`target` is omitted, matching the English and Chinese dashboards. Explicit
targets still override the default; list pricing and the 0% model license fee
are unchanged. The 2026-10-13 choice uses the early-October
[OpenRouter snapshot](https://openrouter.ai/deepseek/deepseek-v4-pro-0813#providers)
as context (40.8 tok/s mean and 39.5 median across 22 endpoint P50 values).
Treat 35 as an editable operating assumption, not a traffic-weighted mean or
an OpenRouter P90-equivalent measurement.

## Staged-run Pareto links

A `/stage-results` response contains one chart link per ingested model, workload,
precision and hardware/framework line. Follow its complete query string: the
run date alone does not identify that line. Dashboard links combine
`i_dates=YYYY-MM-DD~rRUN_ID` with `i_gpus`, `g_model`, `i_seq` and `i_prec`.
`RUN_ID` is the GitHub Actions run ID, not an internal `workflow_run_id`.
Agentic lines may combine speculative methods and parallelism settings; do not
split those points into separate lines merely because their recipes differ.

For the corresponding read-only `inference` view, retain the link's deployment
origin and translate its selectors as follows:

| Chart parameter         | Inference view parameter |
| ----------------------- | ------------------------ |
| `g_model`               | `model`                  |
| `i_seq`                 | `sequence`               |
| `i_prec`                | `precisions`             |
| `i_gpus`                | `gpus`                   |
| `i_dates`               | `dates`                  |
| `i_metric=y_tpPerGpu`   | `metric=tpPerGpu`        |
| `i_xmode=interactivity` | `xmode=interactivity`    |

Use `optimal=true&best=false` to retain the selected line's Pareto points.
Read the `comparisons` item whose `entry` equals the requested
`YYYY-MM-DD~rRUN_ID`; the response's top-level `series` has its own primary selection.
Alternatively, use `runId=RUN_ID` with the same model/workload/precision/hardware
selectors to request that exact snapshot in the top-level `series`.

A run-qualified comparison stays present even when `runId` selects that same
run as the primary series. Each comparison is independently evaluated; it is not
replaced with a date-wide merged curve. An append-only run's snapshot can include
carried-forward points, whose producer identity must remain intact. Do not move
a staging link to production and assume that its unpublished run is available
there. `i_linelabel=1` controls rendered labels only and has no API equivalent.

## View selection

For AgentX inference and historical comparisons, read
[AgentX P90 interactivity](agentic-interactivity.md). Request
`sequence=agentic-traces&percentile=p90&xmode=interactivity` for the inference view.
The historical view fixes P90 by workload and does not accept `percentile`.
Require the historical response's `interactivity.statistic=p90` before labeling
its values as P90. Its CSV exposes `targetInteractivity`,
`interactivityStatistic` and `interactivityField`. Single-turn histories keep the
median; the formal median-only TCO workflow is unchanged.

For a chart of historical performance improvements with associated source PRs and
benchmark runs, use [inferencex-pr-improvements](../../inferencex-pr-improvements/SKILL.md).
Its helper checks whether the deployment supports `chart=waterfall`, then renders
the returned baseline, successive records and best observation. A compatible
saved response also works offline. Source links establish provenance, not an
isolated causal effect of a PR; the outputs are raw-view artifacts, not formal
`inferencex verify` bundles.

All paths below are relative to `/api/v1/views/`. The maintained exhaustive
query-key list is in the app's OpenAPI contract. The following groups explain
which API selectors belong together.

| View                            | Selection and calculation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options`                       | Static registries and defaults, JSON only. Data-dependent run/config choices come from their own views.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xstat, xmetric, percentile, optimal/best/allPoints; API-only equal-service sources/target; roleShare, powerFit, powerBreakdown and headroom panels; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV.                                                                                                                                                                                 |
| `historical`                    | Model, sequence, target, metric, precisions, GPUs/vendors/frameworks/deployment, start/end, TCO and pricing. `extendToDate` labels synthetic extension, defaults to current UTC date. JSON or CSV.                                                                                                                                                                                                                                                                                                                                               |
| `calculator`                    | Model/sequence/run/date, precisions/GPUs, percentile, target/mode, token type, owning/renting cost, TCO, power budget, cost cap, hide-above-limit and public unofficial runs. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                       |
| `first-token`                   | Benchmark selection plus 1–8 positive TTFT caps in seconds, minimum interactivity, cost provider and token type. Shared dashboard winner selection.                                                                                                                                                                                                                                                                                                                                                                                              |
| `cache-reuse`                   | AgentX selection plus exact `config` from returned configurations and `recipe` from data.recipes. Cache-reuse curves retain official versus unofficial evidence.                                                                                                                                                                                                                                                                                                                                                                                 |
| `profit-estimator`              | AgentX selection, comparison dates/runs, target, utilization, lab revenue share, list/OpenRouter/custom token prices, own/rent/custom chip costs, TCO, actual/theoretical cache-hit mode and provisioned/modeled/compare power. USD/chip-hour.                                                                                                                                                                                                                                                                                                   |
| `profit-estimator-per-gigawatt` | Same selectors; USD/GW-year basis and owning-cost default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `fleet`                         | Model/sequence/precision/GPUs, target/percentile, TCO/token type/cost provider, MW, input/output prices, ramp, cache discount, MTBI, recovery, horizon and metric. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                  |
| `evaluation`                    | Model, task, date, precision and GPU selection; public unofficial runs remain separately labeled and independent of the official date cutoff. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                       |
| `reliability`                   | Rolling range, GPU selection and optional `asOf` date for reproducibility. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `gpu-specs`                     | Full hardware properties or selected metric ranking; table/radar/bar are renderings of these values. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `overview`                      | Models, model/hardware row limits, hardware tier, engine, comparison mode and reference. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rankings`                      | Ranking kind (model or chip), selected model/scenario and format. Use the exact values in OpenAPI.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `compare`                       | GPU pairs, model/slug, scenario, tier selection and variant. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `collectivex`                   | Ordered run selection and suite; EP size/phase/modes/precision/operation/percentile/axis/SKU/backend/series; KV page size/x/y/pull/push/overlap ISL/series; swap direction/layout/metric/percentile/series.                                                                                                                                                                                                                                                                                                                                      |
| `submissions`                   | Search, table sort/direction/offset/limit, weekly/cumulative chart, on-change cutoff and NVIDIA/AMD/total lines. Table search does not filter the independent submission-volume chart.                                                                                                                                                                                                                                                                                                                                                           |
| `current-inferencex-image`      | Model, sequence, hardware, precision, speculation, node type, framework families, `asOf` for image age/release status, and `includeHistory` for daily age history.                                                                                                                                                                                                                                                                                                                                                                               |
| `gpu-metrics`                   | Required run, file/host artifact, GPU indices, metric or correlation axes, statistics sorting, chart mode and interactive downsampling preference. One telemetry source per run; full-record statistics computed on read. Not a serving-window/role-pool projection. Responses are no-store.                                                                                                                                                                                                                                                     |
| `ubenchx`                       | Test selector (`test`: `mem-bw`, `sm-l2-distance`, `tpc-skyline`, or `all`) plus GPU selector (`all` or one GPU). `mem-bw` returns static device-memory copy bandwidth rows with derived MBU and latency. `sm-l2-distance` returns SM-to-SM L2 latency difference matrix with GPC/die topology and summary statistics. `tpc-skyline` returns measured TPCs per GPC (sorted descending) with GPC, TPC, and SM counts, defaulting to every GPU. `all` (default) returns every test. The Y-axis selector on `/ubenchx/mem-bw` is presentation-only. |
| `video`                         | CI run/artifact discovery; only already-published artifact reads; source, serving cell, media/fidelity slot, power phase and GPU denominator; same-workload comparisons, axes, deployment costs and selected tradeoff point. No-store.                                                                                                                                                                                                                                                                                                           |

## Interpretation and maintenance

### GPU telemetry coverage

`/api/v1/views/gpu-metrics` requires a positive safe-integer `runId`. Choose
`artifact` from `artifacts[]`: a plain artifact name, or `<artifact>/<file>` when
one artifact contains several files. `downsample` only sets the renderer hint
`maxInteractivePoints` to 2000 (default) or `null`; rows and statistics stay unsampled.

Stored telemetry includes run-wide `coverage`, even when one host is selected:
`complete` means the recorded artifact/file inventory is present, `partial` means
recorded telemetry is missing, and `unknown` means a complete inventory was not
retained. `missingArtifacts` lists entirely missing artifacts and may be empty
when only a file is incomplete. GitHub coverage is `null`
(unassessed). Available stored telemetry remains readable when partial; do not
interpret it as a complete run or combine it with live GitHub samples.

### Image submission age

`/api/v1/views/current-inferencex-image?includeHistory=true` adds `ageHistory`:
90 daily UTC points ending on `asOf` (today by default), each containing `date`,
`p90AgeDays` and `configurationCount`. `ageSummary` is always returned for the
current filtered image rows. All existing model, sequence, hardware, precision,
speculation, node-type and framework filters apply to both.
The default scenario is `agentic-traces` (Agentic) and the default `nodeType` is
`all`, including non-disaggregated and disaggregated configurations. A model
without Agentic observations falls back to its first available active scenario.

P90 uses nearest rank, one vote per displayed configuration, measured in whole
days since its latest successful image-bearing submission. Reusing the same
image tag in a new submission resets age. This is not the container's build age.
History carries older observations into the window, includes configurations
only from their first submission, and excludes future observations. Empty days
have `p90AgeDays: null`, not zero. Today's model/scenario retirement rules apply
throughout the historical window; historical retirement states are not stored.
The current table uses the latest benchmark snapshot, whereas history uses
successful image-bearing submission events. The chart's hover and keyboard
inspection are presentation-only and introduce no extra selectors.

OperatorX is feature-gated in navigation and has no published
`/api/v1/views/operatorx` contract. Its `/api/v1/operatorx/*` routes belong to
the page and are not part of this skill's read-only view API. The page-owned
`/api/v1/operatorx/compare?op=gemm&workload=gemm:DeepSeek-V4-Pro` response includes
optional `hardware[].reference` metadata for Ascend 950PR (28 Cube):
`peakTflops.bf16=378`, `memoryBandwidthTBs=1.6`, `memoryBandwidthAssumed=true`,
plus `source` and `qualification`. FP8/FP4 peaks remain null. Normalized X is
arithmetic intensity divided by 236.25 FLOP/byte; Y is achieved TFLOPS divided
by 378. The bandwidth is an assumption, not an independently verified memory/ECC
configuration. Apply these references to the returned measurements; do not substitute
the older matmul sweep for the ingested F.linear results. Missing measurements stay
missing. The 950PR crimson color is presentation-only; the stored key remains `ascend950pr`.
The response also returns workload-resolved `defaults`: `metricVsSizeSlice` prefers
an existing ranked slice with successful positive finite 950PR latency at two or
more distinct positive sizes, falling back to the existing largest slice.
`rooflinePrecision` prefers BF16 with FLOP/byte counts, otherwise the most common
supported precision (null when none); `rooflineNormalized` is true. Missing/error/
unsupported rows do not qualify the preferred slice. Explicit UI selections override
these initial defaults; hardware visibility and measured values are unchanged.

The explorer's session-list version filter uses the same parser as its other
pages: absent, `all`, invalid, or out-of-range versions mean no version filter.
The Agentic Workload Explorer is also feature-gated and has no published
`/api/v1/views/agentic-workload-explorer` contract. Its
`/api/v1/agentic-workload-explorer/*` routes serve a frozen, anonymized
ProxyTrace snapshot to the page and are not part of this skill's read-only view API.
Its shared select/toggle controls retain the same model, client, time-window, and
trace-version query semantics. Shared-D3 chart expansion, zoom/reset, tooltip,
and PNG export are presentation-only controls; they add no API routes or writable
snapshot access.

Use positive safe run IDs written as plain digits (`1e3`, `0x10`, and `+5` are
rejected); run lists such as `unofficialrun` and `runs` take up to eight unique IDs.
Overlay run indices follow the input order after trimming whitespace and removing
duplicates. Preserve those indices when attributing results to a run.
`runId` selects an exact logical snapshot, not necessarily
newly measured producer rows. Comparison entries accept `YYYY-MM-DD` or
`YYYY-MM-DD~rRUN_ID`; `start` and `end` add the endpoints, not every intervening
day. Date-only comparisons select that day's exact logical snapshot; the primary
`date` selector remains an as-of cutoff. Historical `start`/`end` instead bound
source observations inclusively.
Public unofficial overlays must not be relabeled as official results.

`i_rulers` belongs to browser share links for the primary inference chart;
date-comparison rulers are not shared. It is not a views API parameter. Tooltip
scrolling and viewport limits only affect access to existing actions; neither
changes API data or calculations.

For measured-power gauges, `optimal=true` keeps the chart's higher-power outer
envelope. `frontier.direction` describes that boundary; `metric.direction` retains
the optimization direction used by `best=true`. Interpret the envelope as a load
boundary, not evidence that those points are more energy efficient.

The dashboard names its four boundaries GPU Level Measured, GPU Level Provisioned
(TDP), All in Provisioned, and All in Measured. All in Measured combines measured
GPU power with modeled unmeasured components and PUE; do not describe it as measured
wall power. GPU Level Provisioned (TDP) and All in Provisioned publish only J per
output token. Their watts are per-hardware constants (rated TDP, and the registry's
all-in utility power with PUE already included), drawn only as power-timeline reference
lines: `metric=y_gpuProvisionedWatts` and `metric=y_utilityProvisionedWatts` return 400.
Other metric IDs and API selector values are unchanged. Profit `powerBasis`
still accepts `provisioned`, `modeled`, or `compare`; `powerLabel` is display text.
Expanding assumptions or unavailable-estimate details does not change returned data.

All in Measured watts and energy accept validated `single_turn` and AgentX rows
through the shared chart/API transform, including historical and unofficial rows.
AgentX uses the power model's agentic workload state without independent workload
calibration. Telemetry and topology gates still apply.

For All in Measured, `tableRows` retains every GPU-valid observation in the selected
scope and best-series selection, including axis-clipped and non-frontier points.
Missing system estimates use `y: null`, `status: "unavailable"`, and
`unavailableReason`; `measuredGpuWatts` remains available. CSV exports these rows
with blank missing values. Numeric `series` and `count` are unchanged. Each date
comparison and unofficial overlay has its own `tableRows`; latest does not pool history.

NVL72 rows need valid GPU power and take an equal compute-tray share of the InferenceX
`power_model` rack at PUE 1.1. Validated Grace-socket power with complete socket
coverage replaces the modeled Grace CPU and memory; otherwise (including CPU-rail-only
and module readings) the rack's modeled Grace profile is used. Read `powerSource` for
topology, `cpu` (measured or modeled), PUE and the pinned InferenceX `power_model` commit. Model-only updates recalculate retained
valid measurements after deployment; they do not require telemetry backfill. For
GW-year estimates, `modeled` first selects
points with valid system-power inputs, then builds the curve at the requested target.
It does not extrapolate or substitute historical snapshots. `compare` uses the same
valid-curve throughput for both budgets; if no valid curve covers the target, it keeps
the original provisioned estimate. `provisioned` alone retains the original performance
curve. Official, comparison and unofficial scopes are evaluated independently.
`skipped.reason` distinguishes missing CPU power and incompatible power bases;
modeled estimates never substitute provisioned watts.

Prefer equal-service comparisons for article-facing hardware analysis. Use
`xstat=mean` only for fixed-sequence service axes when that statistic is intended:
streaming speed then means **1 / mean TPOT**, not arithmetic mean request speed.
TTFT/E2E use recorded means. Default is median; absent means are not replaced.
AgentX still uses `percentile`; concurrency uses no statistic. Check resolved
`params.xstat` and `xAxis.statistic`, not the requested parameter alone.

Equal-service and matched-concurrency analysis and the power fit (`powerFit`) are API-only.
The PowerX tab keeps the role and power-breakdown panels, but has no service-comparison control,
source selector, target input, matched-concurrency table or power-fit view. Use `serviceCompare`, `serviceBaseline`, `serviceComparator` and
`serviceTarget` as API query parameters; they have no dashboard share-parameter equivalents.

`serviceCompare=true` returns exact opaque `serviceSources` keys, an
`equalServiceCurve`, and an optional `equalServiceComparison` at `serviceTarget`.
Use returned keys verbatim for `serviceBaseline` and `serviceComparator` via
`URLSearchParams`; never substitute bare GPU names. Each `label` is display text
(hardware and date, plus precision, topology or run only where two sources would
otherwise look alike); select and join by `key`, never by label. Omitted keys select the first
two sources; unknown explicit keys stay unavailable. Omitted target means no
selected-target result. Targets are tok/s/user for streaming speed, seconds for
TTFT/E2E. Concurrency is unsupported for equal-service interpolation.

A source groups one logical curve snapshot and configuration. Stitched points retain
their original producer provenance; differing telemetry producer/exporter hashes do not
split the snapshot. Recipe, image and topology remain distinct. Rows without a snapshot
retain their own run, measured date and telemetry producer/exporter hashes in the source key.

The API uses scoped observed points before frontier/best
pruning, with no power-comparison clones. It interpolates raw quantities
linearly only inside each exact source range, then reports signed
`100 × (comparator / baseline − 1)`. Metrics are measured GPU W/GPU,
whole-deployment output tokens/s, and validated GPU J/output token. Negative energy
change means lower comparator energy. Preserve bracket endpoint identities,
`interpolated`, missing reasons and nulls. Never call interpolated points new
measurements or bridge different sources, recipes, topologies or missing endpoints.

`serviceCompare=true` also returns `matchedConcurrency`: the two selected sources
paired at each concurrency either observed. Sides are `observed`, `missing`, or
`ambiguous` (disagreeing duplicates, none chosen); `changePercent` needs both
observed. It is a same-load diagnostic: speeds usually differ, so never present it
as an equal-service result.

`roleShare=true` returns validated disaggregated prefill/decode J/output and their
shares of reconstructed total energy. It converts prefill J/input using the
same-window aggregate J/output-to-J/input ratio; it does not compare unlike token
denominators. Missing roles are omitted. `rolePoints` adds per-observation role
W/GPU, role-local J/input and J/output (different denominators, never add them)
and the output-token reconstruction, with nulls for missing figures.

`powerFit=true` returns `powerFits`: per source, an OLS line of measured mean W/GPU
against output tok/s per allocated GPU, with `P₀`, slope `m` (J/output token), R²,
n, x-range, registry `tdpWatts` and point identities. Fewer than three distinct
rates return `fit: null`, `reason: "too-few-points"`. Call `P₀` an extrapolated
intercept, not idle power, and do not read the line outside its x-range.

`powerBreakdown=true` returns `powerBreakdowns`: per hardware line (`hwKey|precision`,
the chart legend grouping), each point's All in Measured W/GPU split into `gpu`
(measured board power), `measuredCpu` (Grace sockets, NVL72 only, when socket telemetry
is valid), and the modeled `server` parts, `fansPsu` (fans + conversion loss), `network`
(scale-out share) and `facility` (PUE overhead). Each part is the deployment share ÷
allocated GPUs, so the parts sum to `totalWattsPerGpu`. Only `gpu` and `measuredCpu` are
measured; call the rest modeled at the point's measured GPU power under `modelRevision`.
`tdpWattsPerGpu` and `allInProvisionedWattsPerGpu` are rated references, not Pareto power
metrics. Points are sorted by `interactivity` on `interactivityField`: the chart's
interactivity x-axis (AgentX P90/P75 included), otherwise `median_intvty`. Points without
validated GPU telemetry, a supported system model or positive interactivity are omitted.

`headroom=true` returns `headroom`: the PowerX measured-vs-TDP table. Per hardware line
(`hwKey|precision`), the measured average and P90 GPU W per chip read at 25 / 50 / 100 /
300 tok/s/user (`interactivities`, on `interactivityField`) with the chart's own
interpolation (throughput Pareto front, monotone Steffen spline, no extrapolation), the
P90 share of the registry TDP (`percentTdpP90`) and `headroomPercent = 100 − percentTdpP90`.
A cell outside a line's measured range (`interactivityMin`..`interactivityMax`) is `null`,
never a guess; lines without P90 power, throughput, a registry TDP or two points are omitted.
These are GPU board figures; TDP does not bound IT or facility power.

A fifth power basis, `it-modeled` (All in Measured IT, no PUE), sits between the GPU and
the facility meter: the measured GPU plus the modeled CPU, server parts, fans and PSU loss
and the network share of `powerBreakdowns`, without the `facility` part. Its `metric`
values are `y_itModeledWatts` and `y_itModeledJPerOutputToken`; they share the All in
Measured table rules (rows without a model stay with their reason) and the same
coverage. `utility-modeled` = `it-modeled` × PUE at every point. Storage and out-of-rack
network are not modeled.

The PowerX dashboard tab (`/powerx`, `/zh/powerx`) is a presentation of the
`inference` view and adds no selectors. Its Power draw, Energy per token, Over time and
Where the power goes tabs select existing `metric` values; the chip comparison and
per-chip drill-down read `powerBreakdowns` (`powerBreakdown=true`). Chips with measured
GPU power but no supported system model are named as not shown, not dropped silently.
On that tab the Count control names three measured boundaries, GPU only (`gpu-measured`),
IT (no PUE) (`it-modeled`) and Facility (`utility-modeled`), plus All; All
(`i_pcompare=boundaries`) draws those three per chip on the Power draw or Energy scatter
(GPU only solid, IT dashed, Facility dash-dot), and the legend, line labels, tooltips, table
and CSV call them GPU only, IT (no PUE) and Facility; the page has no further control layer.
Every power number on the tab carries a GPU, IT or Facility tag, explained once in How we
measure, and a readout row under the caption gives the hovered or pinned point's IT W per
GPU, GPUs per MW (1e6 ÷ IT W per GPU) and facility W per GPU at the model's PUE. The four
views are tabs above the plot; Count, Per and Show as sit in the legend rail, and Scope,
Power statistic, Rated boundaries (`i_pcompare=all`: adds the two rated bounds to Count: All)
and Split by sit in its collapsed More views expander.
Power draw shown as % of TDP shades each chip's headroom between its P90 draw and 100 % and
adds the headroom table (`headroom=true`) with a CSV download. On Where the power goes the
chip comparison stacks IT only by default; an Include facility switch (presentation only, no
API selector) appends the PUE part; the compared chip's across-load drill-down (stacked bars or
stacked area, `i_pbview`) is open inline under its bar and follows the slider, and the view
itself is `i_pcompare=breakdown` (no boundary line chart; the boundaries are compared on Power
draw under Count: All). Over time adds a load-swing table per
trace (peak, min, idle floor, mean, P5/P95, max 1 s and 5 s change, ramp up/down, volatility),
a × 72 per NVL72 rack switch, and per-point CSV / JSON downloads served by
`/api/v1/gpu-metrics-point/stats` (`format=csv|json`, `scale=gpu|nvl72`), which computes the
same statistics from the same stored buckets. None of this adds `inference` view selectors.
A share link with `i_pcompare=all` adds the two provisioned bounds. Inference Performance offers no power metrics: an `/inference` link with a
measured `metric`, or with a power-tier filter and no `metric`, opens `/powerx` with the same
filters. Historical Trends keeps its measured power and energy metrics.
PowerX 仪表板标签页（`/powerx`、`/zh/powerx`）是 `inference` 视图的另一种呈现，不新增选择项；
芯片对比与单芯片下钻读取 `powerBreakdowns`。没有受支持系统功耗模型的芯片会标注为未显示。
统计范围控件命名三个实测边界：仅 GPU（`gpu-measured`）、IT（不含 PUE）（`it-modeled`）与数据中心（`utility-modeled`），外加“全部”；“全部”（`i_pcompare=boundaries`）在功耗或能耗散点图上按芯片绘制这三条（仅 GPU 实线、IT 虚线、数据中心点划线），图例、曲线标签、提示框、表格与 CSV 也沿用这一叫法；页面不再有第二层控件。页面上每个功耗数值都带有 GPU / IT / 数据中心标签，并在“测量方法”中统一解释；标题行下方的读数行给出悬停或固定数据点的每 GPU IT 功耗、每 MW 可支持的 GPU 数（1e6 ÷ 每 GPU IT 功耗）以及按模型 PUE 计的每 GPU 数据中心功耗。四个视图为图表上方的标签页；统计范围、计量单位与显示方式位于图例栏，统计范围、功耗统计量、额定边界（`i_pcompare=all`，在“统计范围：全部”之上加入两个额定边界）与拆分方式收在图例栏折叠的“更多视图”中。“功耗”视图按 TDP 占比显示时，会在各芯片 P90 功耗与 100% 之间填充余量，并附带余量表（`headroom=true`）与 CSV 下载。“功耗去向”中芯片对比默认只堆叠 IT 部分；“计入数据中心开销”开关（仅为展示，不新增 API 选择项）追加 PUE 部分；所对比芯片的“随负载变化”下钻图（堆叠柱状图或堆叠面积图，`i_pbview`）默认即在其横条下方内联展开并随滑块切换芯片，该视图本身为 `i_pcompare=breakdown`（不再有功耗边界曲线图；边界对比位于“功耗”视图的“统计范围：全部”）。“随时间变化”新增每条曲线的负载波动表（峰值、最小值、空闲底线、均值、P5/P95、最大 1 秒与 5 秒变化、上升/下降速率、波动率）、“× 72（每 NVL72 机架）”开关，以及由 `/api/v1/gpu-metrics-point/stats`（`format=csv|json`、`scale=gpu|nvl72`）提供的逐点 CSV / JSON 下载，该接口用同一函数基于同一已存数据桶计算统计。这些都不新增 `inference` 视图的选择项。分享链接带 `i_pcompare=all` 时会加入两个额定边界。
Inference Performance 不再提供功耗指标：带实测 `metric`，或带功耗等级筛选但未指定 `metric` 的 `/inference` 链接会以相同筛选条件打开 `/powerx`。Historical Trends 仍保留实测功耗与能耗指标。

These analytical results (`serviceCompare`, `roleShare`, `powerFit`, `powerBreakdown`, `headroom`) require JSON; enabling any with CSV returns 400. CSV exports plotted points except for All in Measured and its IT boundary, which export `tableRows`.

同等服务对比与同并发诊断仅通过 API 提供，查询参数为 `serviceCompare`、`serviceBaseline`、
`serviceComparator` 和 `serviceTarget`；仪表板没有对应的服务对比控件、来源选择、目标值输入、
同并发表格或分享参数。功耗拟合（`powerFit`）同样仅通过 API 提供；PowerX 标签页保留角色分析与系统功耗构成面板，分别对应 `roleShare`
和 `powerBreakdown`。功耗构成中只有 `gpu` 与 `measuredCpu` 为实测值，其余部分为
按该点实测 GPU 功耗建模的结果，各部分之和等于 All in Measured W/GPU。各点按 `interactivityField` 上的
`interactivity` 排序：图表 x 轴为交互性时（含 AgentX P90/P75）沿用该轴，否则使用 `median_intvty`。来源标识、插值规则、缺失原因和仅 JSON 的响应约束以上文说明为准。

Concurrency is not an `xmode`: GPU count varies across configurations, so
concurrency alone is not comparable between them. Each point still reports its
`concurrency`. Filter `topologies` with one or more exact `point.topologyKey`
values from a first response (encode with `URLSearchParams`). This selects the same GPU count,
parallelism, role-pool split and offload mode across hardware without removing
loads. Unknown metadata stays unknown, not equivalent to an explicit setting.
Keep hardware, precision, recipe, run/date and software provenance separate;
matching topology alone does not establish a controlled hardware comparison.
Missing concurrency points must remain absent, not interpolated or extrapolated.

Fleet lifecycle defaults (ramp, cached-input percent, MTBI, recovery) follow the
dashboard's lifecycle panel; read the current values from `/api/v1/views/options`
rather than hard-coding them.

`costh` means owning and `costr` means renting; there is no `costn` provider.
Custom chip costs are USD/chip-hour, token prices USD/million tokens,
interactivity tok/s/user, and video costs USD/deployment-hour. Preserve the
response's resolved TCO, utilization, license share, topology and power basis.
Modeled and provisioned power are distinct. Missing measured evidence is not zero.
GPU chart projections omit missing metric readings; measured zero remains zero.
The selected file/host series' full-record statistics include startup and warmup
and cover all chips regardless of visibility or chart downsampling. Stats rows carry
no `metric` field; `params.metric` identifies the selected metric. For stored runs they
are computed from the stored samples on each read; a series whose stored samples are
incomplete returns no statistics. Keep these sample-weighted statistics separate from
serving-window power and J/token. The view reads each run from one source: its stored
series once the run is ingested, otherwise its artifacts. It preserves upstream 503
failures. Treat an error as unavailable evidence, not an empty dataset.

Zoom, axis scale, theme, labels, report expansion, media playback and download
buttons are presentation state, not new datasets. AI-chart provider keys and
private prompts, feedback, local uploads and administrative mutations are not
public read projections. AgentX drilldowns use existing availability, aggregates,
histograms, request timelines, logs and server metrics operations.

Run-specific recognition labels do not rename API framework keys. Runs
`35879254139` and `37181045340` display `UMBP MoRI SGLang` through October 9, 2026 in
America/New_York (`2026-10-10T04:00:00Z` exclusive); subsequent label resolution
returns `MoRI SGLang`. An already-open memoized chart may need a refresh.
Keep using `mori-sglang` for API selectors and raw CSV output throughout.
This display-only exception changes no API data or OpenAPI contract.

`MoRI vLLM` is the display label for `vllm-disagg` in charts and read-only
views. Keep using `vllm-disagg` as the raw framework key and
`mi355x_vllm-disagg` as its MI355X hardware selector; the label does not rename
stored data or API selectors.

For every new or changed non-sensitive public-facing data view, implement or
update its read-only API in the same PR. Reuse the UI's pure transforms, test
selector effects and source semantics, and update OpenAPI, the route catalog,
coverage inventory and this existing npm package. Hidden navigation and feature
flags do not make public data sensitive.

### Cache-reuse recipe selection

Pass a returned `data.recipes[].key` as `recipe`; `params.recipe` identifies the resolved selection. Missing or stale keys use the dashboard default. Each run uses the selected recipe if available, otherwise its own best-covered recipe. Inspect each bar's source row for its recipe identity. Without official rows, choices come from matching overlay runs.
