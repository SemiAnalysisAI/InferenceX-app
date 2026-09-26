# Dashboard read-only views

Use `/api/v1/views/*` for dashboard-calculated values. Read the deployed
[OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json) first:
these routes become available only after the corresponding app change deploys.
Do not assume an installed skill proves server availability.

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
| `video`                         | Default VideoGenX dashboard: shared workload, deployment, axes, cost tier, API-price reference, optimal and hidden-hardware filters. `view=compare` adds published matched-case selection. Legacy run/artifact discovery/results/tradeoff remain explicit. No-store.                                                                                                                                                                                                                                                                             |

### VideoGenX selection and coverage

With no `run`/`artifact`, `/api/v1/views/video` returns the current dashboard's
published-history projection, not CI discovery. Copy its URL selectors directly:
`v_x`, `v_y`, `v_tier`, `v_optimal`, `v_api`, `v_hidden`, `v_base`, `v_cand`, `v_case`.
`v_view=chart|table` is presentation only. Read resolved `params`; malformed values
use the same defaults as the UI. Unknown/repeated query names still return 400.

- Defaults: P90 seconds vs videos/USD TCO, owning tier `h`, optimal deployments
  only; `r` selects renting. `v_optimal=0` includes dominated deployments. Queued
  client-concurrency cells stay in evidence, outside chart/table.
- `v_hidden` is a comma-separated roster-key list (for example `h100,mi355x`),
  default empty. It filters chart/table only; KPI/Compare/Evidence keep their
  original scope. Unknown keys are ignored, remaining keys are sorted/deduplicated.
- Metrics use participating GPUs. API list price is USD/video-second multiplied
  by clip duration, not TCO, revenue or measured power. `metricDefinitions`
  declares units and optimization direction; missing values remain null.
- The server reads the same first **five published history pages at most** as the
  UI. `coverage.pagesRead`, `coverage.nextPage` and `coverage.truncated` describe
  the inspected window; this is not all-history or date-range coverage. It applies
  the UI's canonical workload selection, sample floor and newest-cell rules.
- Default mode leaves `comparison.cases.status=not-requested`. `view=compare`
  reads at most two already-published media artifacts and returns the matched
  pair selected by `v_case` (zero-based), `resolvedCaseIndex`, pair count and
  unmatched counts. `not-published`, `no-pair` and `unavailable` are explicit
  alternatives to `ready`; `no-pair` means a missing baseline/candidate.
  `ready` means both artifacts were read, not that a matched case exists: always
  inspect `count` and `selected` (they can be 0 and null).
  Returned media paths are relative; private asset URLs and raw bundles are omitted.
- Use `view=discovery&page=1` for the prior CI listing. `run=…&artifact=…` retains
  the legacy result/serving/fidelity contract; `view=results|tradeoff` is explicit.
  Legacy selectors and `v_*` selectors cannot be mixed. Legacy missing artifacts
  return 204; dashboard mode returns its empty/partial projection and coverage.

Example (check deployed OpenAPI availability first; no authentication or write):

```js
const url = new URL('https://inferencex.semianalysis.com/api/v1/views/video');
url.search = new URLSearchParams({
  view: 'compare',
  v_x: 'p50Latency',
  v_y: 'videosPerGpuHour',
  v_tier: 'r',
  v_optimal: '0',
  v_api: '0.08',
  v_hidden: 'mi355x',
  v_base: 'h200',
  v_cand: 'b200',
  v_case: '3',
}).toString();
const response = await fetch(url);
if (!response.ok) throw new Error(`Video view HTTP ${response.status}`);
const data = await response.json();
console.log(
  JSON.stringify({
    params: data.params,
    coverage: data.coverage,
    rows: data.rows,
    comparison: data.comparison,
    provenance: data.provenance,
  }),
);
```

Measured ratios and uncalibrated media similarity do not qualify visual quality,
energy claims or a causal compute/memory bottleneck. Preserve source IDs, seals,
execution/publication times and coverage alongside exported values.

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
the page and are not part of this skill's read-only view API.

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
wall power. Metric IDs and API selector values are unchanged. Profit `powerBasis`
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

For every new or changed non-sensitive public-facing data view, implement or
update its read-only API in the same PR. Reuse the UI's pure transforms, test
selector effects and source semantics, and update OpenAPI, the route catalog,
coverage inventory and this existing npm package. Hidden navigation and feature
flags do not make public data sensitive.

### Cache-reuse recipe selection

Pass a returned `data.recipes[].key` as `recipe`; `params.recipe` identifies the resolved selection. Missing or stale keys use the dashboard default. Each run uses the selected recipe if available, otherwise its own best-covered recipe. Inspect each bar's source row for its recipe identity. Without official rows, choices come from matching overlay runs.
