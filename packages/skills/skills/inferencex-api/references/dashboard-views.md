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
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xstat, xmetric, percentile, optimal/best/allPoints; API-only equal-service sources/target; roleShare and powerFit panels; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV.                                                                                                                                                                                                           |
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

OperatorX is available in primary navigation without an unlock and has no published
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

Distribution per GPU uses the page-owned comparison API's optional
`distributionMetric` (`latency`, `tflops`, `bandwidth`, `computeUtil`, or
`bandwidthUtil`), `distributionNormalized` (`true`/`false`),
`distributionMatchedOnly` (`true`/`false`), and `distributionHardware` (comma-separated
hardware keys). Any of these returns a `distribution` projection with resolved
parameters, per-hardware p5/p25/p50/p75/p95, counts, and `caseIndices` into the
response's source-preserving `measurements` columns. Defaults are `tflops`,
unnormalized, matched only, and all available hardware. Normalized TFLOPS uses
each case's precision-specific peak TFLOPS; normalized bandwidth uses peak TB/s.
The ratios use 1 for 100% and retain values above 1; the chart displays
percentages. Missing
measurements and cases without documented peaks are excluded, and matched cases
are recalculated after normalization. Latency cannot be normalized and resolves
`distributionNormalized` to false, as do metrics already expressed as peak shares.
This is page-owned data, not a published
OpenAPI operation. `op` and `workload` keep the comparison route's usual semantics.

中文：Distribution per GPU 的页面专属接口可通过 `distributionMetric`、
`distributionNormalized`、`distributionMatchedOnly` 和 `distributionHardware`
读取与图表一致的箱线图统计。归一化时，TFLOPS 按对应精度的计算峰值计算，带宽按
TB/s 峰值计算；接口以 1 表示 100%，保留超过 1 的比值，图表显示百分数。缺失测量值或峰值的用例不参与
统计，匹配用例集合按归一化后的有效测量值重算。延迟不支持峰值归一化，返回的
`distributionNormalized` 为 false；已经表示峰值占比的指标也是如此。原始测量列仍保留状态和 run/result 来源。

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

Equal-service and matched-concurrency analysis are API-only. The dashboard keeps role and
power-fit panels, but has no service-comparison control, source selector, target input or
matched-concurrency table. Use `serviceCompare`, `serviceBaseline`, `serviceComparator` and
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

These analytical results require JSON; enabling any with CSV returns 400. CSV exports plotted points except for All in Measured, which exports `tableRows`.

同等服务对比与同并发诊断仅通过 API 提供，查询参数为 `serviceCompare`、`serviceBaseline`、
`serviceComparator` 和 `serviceTarget`；仪表板没有对应的服务对比控件、来源选择、目标值输入、
同并发表格或分享参数。角色分析和功耗拟合面板仍在仪表板中提供，分别对应 `roleShare` 和
`powerFit`。来源标识、插值规则、缺失原因和仅 JSON 的响应约束以上文说明为准。

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

### Landing-page Huawei link

The English and Chinese landing pages link Huawei Ascend 950PR results to
`/operatorx` and `/zh/operatorx`, respectively. The logo and result button are
presentation-only navigation to the existing OperatorX view: they add no data
selectors, defaults, calculations, or API contracts. Existing OperatorX API
coverage applies; no additional endpoint or OpenAPI change is needed.

中文：英文和中文首页分别通过华为 Ascend 950PR 结果入口链接至 `/operatorx` 和
`/zh/operatorx`。Logo 和结果按钮仅用于导航，不新增数据筛选条件、默认值、计算逻辑或
API 契约；沿用现有 OperatorX API，无需新增接口或修改 OpenAPI。

### Landing-page MiniMax M3.1 Flash link

The English and Chinese landing pages link MiniMax M3.1 Flash to
`/inference/minimax-m31-flash` and `/zh/inference/minimax-m31-flash`. This
featured row is presentation-only navigation to an existing AgentX model view.
It changes no data selectors, defaults, calculations, or API contracts; use the
existing inference view API for its results.

中文：英文和中文首页的 MiniMax M3.1 Flash 入口分别链接至
`/inference/minimax-m31-flash` 和 `/zh/inference/minimax-m31-flash`。这条推荐入口仅用于
导航至现有 AgentX 模型页面，不改变数据筛选条件、默认值、计算逻辑或 API 契约；结果仍由
现有推理视图 API 提供。

### Cross-backend case alignment

The comparison API and all charts align cases by the full serialized operation
arguments, including precision, quantization, layout, and shape, rather than the
vendor-specific backend name. For each hardware/case, the view selects the fastest
successful finite positive latency across backends; ties keep the first result.
If no backend succeeds, the first explicit status is retained without inventing a
measurement. The newest-per-hardware/case/backend raw selection is unchanged.
`measurements[hardware].backend` identifies the selected backend alongside its
original run, revision, result index, kernel, and CUDA Graph flag. Head-to-head
points and timeline inspection use these same selected measurements. Thus identical
BF16 cases measured by `torch_npu_linear` and `vllm` can be compared, while different
precision or quantization arguments remain separate. No public OpenAPI operation
is added: OperatorX remains a documented page-owned API.

中文：对比 API 与所有图表按完整算子参数匹配测试用例，保留精度、量化、布局和形状差异，
不再要求不同设备使用相同 backend。同一设备、同一用例有多个 backend 时，选择成功且延迟为
有限正数的最快结果；延迟相同则保留首条结果。若没有成功结果，则保留首条明确状态，不补造测量值。
原始数据仍按设备、用例和 backend 分别选取最新结果。`measurements[hardware].backend`
记录所选 backend，并保留原始 run、revision、result index、kernel 和 CUDA Graph 标记；
Head to head 与时间线使用同一条测量记录。OperatorX 仍使用页面专属 API，不新增公开 OpenAPI 接口。

### OperatorX compact reads

OperatorX's page-owned comparison endpoint reads versioned per-run projections
prepared atomically during ingestion, fetched in one revision-aware SQL query.
It returns the same cases, defaults,
measurements, statuses, backend attribution, and revision-safe timeline references
as the raw reader. Old or unbackfilled runs retain raw-reader fallback; partial
storage reads are never cached. Profiling artifacts are fetched only for details.
This changes storage and latency, not public selectors or numerical semantics;
there is no additional public OpenAPI operation. See `docs/operatorx.md` for migration,
read-role privileges, backfill, warming, and reproducible benchmark instructions.

中文：OperatorX 的页面专属对比接口优先读取写入时生成的精简记录，保留原有用例、默认值、
测量值、状态、backend 和时间线来源。旧运行可回退至原始读取路径；部分读取失败的响应
不会缓存。此改动优化存储读取和延迟，不改变公开筛选条件或计算，也不新增公开 OpenAPI 接口。

### Parallel timeline reads

Timeline reads share one raw fetch per run, with at most four runs concurrent.
Request order, revision checks, missing/null results, and error handling are preserved.

中文：时间线按运行复用读取，最多四个运行并发；保留请求顺序、revision 校验、缺失结果和错误处理。

### Shared merged-comparison cache

Optional revision-keyed Blob caching reuses merged comparisons without changing
selectors or results. Partial/replaced revisions stay uncached. Configuration,
isolation, invalidation, and remaining run-list cost: `docs/operatorx.md`.

中文：可选的 Blob 缓存按 revision 复用合并结果，不改变筛选条件或数值；部分失败及已替换
revision 不会缓存。配置、隔离和清除规则见 `docs/operatorx.md`。

OperatorX presentation-only exclusions: deferred mounting and landing-link intent
prefetch use existing APIs and preserve both locales' selectors and measurements.

## Model architecture coverage

Arrow diagrams expose the same attention-layer categories and exact layer counts
as this catalog. `alternatingLayers` groups repeated layer types; use
`alternatingNote` / `alternatingNoteZh` for their interleaving, rather than
interpreting the categories as contiguous blocks. Expanding a Transformer or FFN
block is presentation only and does not change the returned data.

`GET /api/v1/views/model-architectures` returns the same `MODEL_ARCHITECTURES`
registry used by `/model/<slug>`, `/zh/model/<slug>`, and dashboard diagrams.
Omit `model` for all entries, or pass an exact display name such as `Kimi-K3` or
a canonical compare slug such as `kimi-k3`. Empty values, aliases, unknown
parameters, and repeated parameters return 400. No `format` parameter is accepted.
The response is JSON with `view`, `apiVersion`, resolved `params.model`, and
`models: [{ slug, architecture }]`; `slug` is null for a registry model without
a canonical compare slug. No authentication is required. Successful responses
use `Cache-Control: public, max-age=0, s-maxage=300`.

| Surface or control                                                                                     | Read-only coverage                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model architecture selection                                                                           | `model` selects one entry; omission returns all registry entries, including hidden models.                                                                    |
| Parameter counts, dimensions, context, attention, FFN, expert routing, optional architectural features | `architecture` preserves registry values exactly; parameter counts are in billions, dimensions/context in exact counts. Missing optional fields stay omitted. |
| Vendor provenance and model identity                                                                   | Preserve `architecture.sourceUrl`, `architecture.model`, and `slug`; related checkpoints can share a model identity.                                          |
| English and Chinese model architecture pages                                                           | Both render the same facts; bilingual pattern notes are included when supplied.                                                                               |
| Diagram expansion, collapse, layout, tooltip visibility and navigation                                 | Presentation only; these controls do not change architecture facts.                                                                                           |
| Model-page benchmark controls and unofficial overlays                                                  | Existing `inference` view; this architecture catalog does not read benchmark data or unofficial runs.                                                         |
| Static model editorial prose                                                                           | Discover through the existing model pages and text feeds; no separate measurement calculation.                                                                |
| Credentials, private artifacts, feedback and administration                                            | Excluded: sensitive data or mutation operations, unrelated to public architecture specifications.                                                             |

Do not treat rounded vendor parameter totals as exact checkpoint tensor counts,
and retain any advertised-context qualification alongside the configured length.
For causal encoder-decoder models preserve separate prefill and decode active
counts when supplied. Conditional-memory and auxiliary-module accounting is
model-specific; retain the registry's accompanying features and source link.
