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
   MiniMax M3 and DeepSeek V4 Pro have `category=deprecated` in `options.models`.
   They remain selectable through explicit model parameters and overview
   `modelScope=all`. MiniMax M3.1 Flash and DeepSeek V4.1 Flash remain in the default
   model group. Historical data and unofficial-run overlays remain available;
   current-image views exclude both retired models.
   Preserve `options.models` order within each category when rendering model
   selectors. The default group is Kimi K3, DeepSeek V4.1 Flash, GLM5.2/GLM5.3,
   MiniMax M3.1 Flash, Muse Spark Open, Qwen3.5, then
   Qwen3.8 Flash Next. This presentation order does not change `defaults.model`
   or the overview's model order.
   For models with `category=deprecated`, inference charts append `(Deprecated)`
   to the source attribution, or `(已弃用)` in Chinese. The suffix is also included
   in PNG exports and unofficial-run overlays; there are no deprecated background
   watermarks. This is presentation only: view API values and filters are unchanged.

   中文：对于 `category=deprecated` 的模型，推理图表在来源署名后添加 `(已弃用)`，
   英文页面显示 `(Deprecated)`。PNG 导出和非官方 run overlay 中也保留该后缀，
   不再显示“已弃用”背景水印。此变更仅影响展示，不改变视图 API 的数值或筛选行为。

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

## Revenue target capacity

Use `/api/v1/views/revenue-capacity?model=Kimi-K3&revenueTarget=1000000&period=month`
for the `/revenue-capacity` and `/zh/revenue-capacity` pages. Request gross revenue,
not profit.

The view supports `revenueTarget` (USD, default 1000000), `period` (`month`,
`quarter`, `year`), `target` (P90 tok/s/user), `utilization` (percent),
`priceSource` (`list`, `openrouter`, `custom`), `inputPrice`, `cachedInputPrice`,
`outputPrice`, `cacheHitMode` (`theoretical`, `actual`), `precisions`, `gpus`,
`date`, `runId`, and `unofficialrun`. It requires AgentX and P90; omitted
precision compares all precisions. Model target and price defaults match the
profit estimator. Month/quarter/year use 730/2190/8760 hours.

Read `data.rows` for official configurations and `overlays.rows` for unofficial
runs. Each row returns `gpuEquivalents`, rounded `requiredGpus`,
`revenuePerGpuHour`, utilization-adjusted `realizedRevenuePerGpuHour`,
`projectedRevenue`, nullable `deploymentGpus`/`deployments`, and source run URLs
and dates. A null deployment size means whole-chip capacity only, not a
deployment plan. Configurations are alternative fleets; never sum their counts.
Missing or out-of-range data stays in `skipped` with a reason.

Coverage: every calculation control maps to the parameters above. Share and CSV
serialize the same applied values; chart ordering, expand/collapse, copy status,
and locale are presentation-only. TCO, license fees, power, cost tiers and profit
history are not inputs to gross revenue capacity. Do not promise demand,
fleet-scale efficiency or redundancy from this estimate.

## Profit estimator defaults

Both views default `cacheHitMode` to `theoretical`, displayed as
“Theroticial Roofline” in English and Chinese dashboards. This uses the
trace-derived infinite-cache hit rate, falling back to the measured rate when
unavailable. Pass `cacheHitMode=actual` for measured cache behavior; dashboard
links preserve that choice as `/cache-hit-mode/actual`. Report the resolved
`params.cacheHitMode` alongside the pricing assumptions.

Both views use model-specific defaults: the lowest multiples of 5 tok/s/user
that reached each model's maximum priced official SKU count in a 5–300 sweep
of the public view API on 2026-10-25:

| Model               | Previous `target` | Default `target` | Priced rows before → default |
| ------------------- | ----------------: | ---------------: | ---------------------------: |
| Kimi K3             |                45 |               60 |                        6 → 8 |
| GLM-5.2/5.3         |               100 |              135 |                       8 → 10 |
| MiniMax M3          |                83 |              115 |                       7 → 10 |
| DeepSeek V4 Pro     |                35 |              170 |                       6 → 16 |
| DeepSeek V4.1 Flash |               125 |              150 |                      17 → 18 |

Both profit views returned the same counts. DeepSeek V4 Pro reaches 16 rows
only at 170 in this sweep; the adjacent steps return 15. The defaults favor
measured SKU coverage, not hosted API speed. Explicit targets override them;
list pricing and model-license assumptions remain unchanged. The Kimi K3
MI355X whitepaper retains its historical 45 tok/s/user target in its links.

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

| View                            | Selection and calculation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`                       | Static registries and defaults, JSON only. Data-dependent run/config choices come from their own views.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xstat, xmetric, percentile, optimal/best/allPoints; API-only equal-service sources/target; roleShare, powerFit, powerBreakdown and headroom panels; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `historical`                    | Model, sequence, target, metric, precisions, GPUs/vendors/frameworks/deployment, start/end, TCO and pricing. `extendToDate` labels synthetic extension, defaults to current UTC date. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `calculator`                    | Model/sequence/run/date, precisions/GPUs, percentile, target/mode, token type, owning/renting cost, TCO, power budget, cost cap, hide-above-limit and public unofficial runs. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `first-token`                   | Benchmark selection plus 1–8 positive TTFT caps in seconds, minimum interactivity, cost provider and token type. Shared dashboard winner selection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cache-reuse`                   | AgentX selection plus exact `config` from returned configurations and `recipe` from data.recipes. Cache-reuse curves retain official versus unofficial evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `profit-estimator`              | AgentX selection, comparison dates/runs, target, utilization, lab revenue share, list/OpenRouter/custom token prices, own/rent/custom chip costs, TCO, actual/theoretical cache-hit mode and provisioned/modeled/compare power. USD/chip-hour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `profit-estimator-per-gigawatt` | Same selectors; USD/GW-year basis and owning-cost default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `fleet`                         | Model/sequence/precision/GPUs, target/percentile, TCO/token type/cost provider, MW, input/output prices, ramp, cache discount, MTBI, recovery, horizon and metric. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `evaluation`                    | Model, task, date, precision and GPU selection; public unofficial runs remain separately labeled and independent of the official date cutoff. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reliability`                   | Rolling range, GPU selection and optional `asOf` date for reproducibility. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `gpu-specs`                     | Full hardware properties or selected metric ranking; table/radar/bar are renderings of these values. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `overview`                      | Models, model/hardware row limits, hardware tier, engine, comparison mode and reference. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `rankings`                      | Ranking kind (model or chip), selected model/scenario and format. Use the exact values in OpenAPI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `compare`                       | GPU pairs, model/slug, scenario, tier selection and variant. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `collectivex`                   | Ordered run selection and suite; EP size/phase/modes/precision/operation/percentile/axis/SKU/backend/series; KV page size/x/y/pull/push/overlap ISL/series; swap direction/layout/metric/percentile/series.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `submissions`                   | Search, table sort/direction/offset/limit, weekly/cumulative chart, on-change cutoff and NVIDIA/AMD/total lines. Table search does not filter the independent submission-volume chart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `current-inferencex-image`      | Model, sequence, hardware, precision, speculation, node type, framework families, `asOf` for image age/release status, and `includeHistory` for daily age history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `gpu-metrics`                   | Required run, file/host artifact, GPU indices, metric or correlation axes, statistics sorting, chart mode and interactive downsampling preference. One telemetry source per run; full-record statistics computed on read. Not a serving-window/role-pool projection. Responses are no-store.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ubenchx`                       | Test selector (`test`: `mem-bw`, `sm-l2-distance`, `tpc-skyline`, `core-memory-profiles`, or `all`) plus GPU selector (`all` or one GPU). `mem-bw` returns static device-memory copy bandwidth rows with derived MBU and latency. The Huawei key is `Huawei 950PR` (measured SKU `Ascend950PR_9579`): FP16 rotating-pool graph timings, 360 observations per size, and explicit 1,600 GB/s reference assumptions in `peakBandwidthSource`. `metadata.protocol`, CANN/torch_npu versions, and absent sizes distinguish them from the GPU protocol. `timeMs` is amortized graph-copy time for these rows; optional row fields retain p10/p90 bandwidth, process medians, slots and working-set bytes. An explicit device filter leaves unavailable tests empty. `sm-l2-distance` returns SM-to-SM L2 latency difference matrix with GPC/die topology and summary statistics. `tpc-skyline` additionally returns `skuConfigurations`, separately from measured NVIDIA `gpus`: nine contributor-supplied Huawei 950PR configurations, not topology measurements. `gpu=all` (default) or `gpu=Huawei 950PR` includes all configurations; `gpu=Ascend 950PR_9579` selects one. Each row preserves core counts, clocks in MHz, memory in GiB, L2 in MiB, virtualisation options, raw DDR Rate values (`unit=null`) and screenshot provenance (`vendorSourceVerified=false`). The same filtered array appears under `tpcSkyline` for `test=all`; absent measurements stay empty. The table has no additional data filters; the profile link and horizontal scrolling are presentation-only. Source metadata remains in the API; the page omits the source footer. `tpc-skyline` returns measured TPCs per GPC (sorted descending) with GPC, TPC, and SM counts, defaulting to every GPU. `core-memory-profiles` combines B200 SXM and Ascend on `/ubenchx/core-memory-profiles`, defaulting to `gpu=all`; the hardware selector maps to `gpu=B200 SXM` or `gpu=Ascend 950PR_9579`. The old `/ubenchx/sm-l2-distance` page redirects here, but its API remains backward compatible. B200 retains the SM matrix, GPC/die metadata and statistics, with `unit=clock64 cycles` and its own `colorLimits`. The Ascend result returns all four Ascend 950PR_9579 scalar-controller matrices (Cube/Vector, isolated/concurrent), actual core IDs, color limits shared only across its four panels, per-die-group means and provenance. Values are mean absolute differences between matched-address profiles in raw `SYS_CNT ticks`, not core-to-core latency or calibrated cycles. No grid-wide barrier is used in concurrent launches. Cell hover, pinning and dismissal by outside click or Escape are presentation-only; all matrix cells remain available in the API. The idle instructions and Clear selection buttons are omitted in both locales; this presentation-only change does not alter the API contract. `all` (default) returns every test. Explicit device filters leave unavailable test sections empty. The Y-axis selector on `/ubenchx/mem-bw` is presentation-only. |
| `video`                         | CI run/artifact discovery; only already-published artifact reads; source, serving cell, media/fidelity slot, power phase and GPU denominator; same-workload comparisons, axes, deployment costs and selected tradeoff point. No-store.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
History tracks the same configurations as `ageSummary`: the current filtered
table rows dated on or before `asOf`. Its last point equals `ageSummary`. Each
configuration replays its successful image-bearing submissions up to its
current row's date, carries older observations into the window, appears only
from its first submission, and never uses future observations. Configurations
missing from the current table, such as Agentic speculation or node-type
variants replaced by a newer run of the same curve, are excluded from every
point. Empty days have `p90AgeDays: null`, not zero. The chart's hover and
keyboard inspection are presentation-only and introduce no extra selectors.

Each row's `actualLatest` is the latest vLLM or SGLang release tag for its base
engine (Dynamo, MoRI, llm-d, and `-disagg` variants map to the base engine), or
null. `outdated` is true when the image tag's `X.Y.Z` version is below that
release. A nightly whose commit GitHub resolves is outdated only when that
commit is an ancestor of the release (`behind` in the release's `commits`
map). Other nightlies compare their build date with the release's publish date:
the date in the tag, else the build's earliest submission in the image catalog.
Custom tags and engines without a release stream (TensorRT-LLM, ATOM) are never
flagged.

OperatorX is available in primary navigation without an unlock and has no published
`/api/v1/views/operatorx` contract. Its `/api/v1/operatorx/*` routes belong to
the page and are not part of this skill's read-only view API. The page-owned
`/api/v1/operatorx/compare?op=gemm&workload=gemm:DeepSeek-V4-Pro` response includes
optional `hardware[].reference` metadata for Ascend 950PR (28 Cube):
`peakTflops.bf16=378`, `peakTflops.fp8=756`, `memoryBandwidthTBs=1.6`, `memoryBandwidthAssumed=true`,
plus `source` and `qualification`. These are dense Cube-only peaks; FP4 remains null.
Normalized X is arithmetic intensity divided by 236.25 FLOP/byte for BF16 or 472.5
for FP8; Y is achieved TFLOPS divided by 378 or 756 respectively. FP8 activation
quantization remains inside the measured latency. The bandwidth is an assumption, not an independently verified memory/ECC
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
is valid), and the modeled `cpu` (host sockets), `memory` (host DRAM), `nic` (NIC cards +
system-side optics), `nvswitch` (NVLink switch ASICs and trays), `storage` (NVMe), `other`
(PCIe switches, retimers, shelf controllers), `fans`, `psuLoss` (AC/DC + DC/DC conversion
loss), `network` (scale-out share) and `facility` (PUE overhead), in that stack order.
`categories` lists the parts with watts on at least one point: an NVL72 line with measured
sockets has no `cpu` or `memory` (the socket figure covers both), an AMD line has no
`nvswitch`, a B300 line has no `other`. Each part is the deployment share ÷ allocated GPUs, so the parts sum to
`totalWattsPerGpu`. Only `gpu` and `measuredCpu` are measured; call the rest modeled at the
point's measured GPU power under `modelRevision`.
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
per-chip drill-down read `powerBreakdowns` (`powerBreakdown=true`). The drill-down's chart
and the comparison bars fold the twelve parts into six hatched layers (`gpu`; `measuredCpu`;
the server parts `cpu` + `memory` + `nic` + `nvswitch` + `storage` + `other`; `fans` +
`psuLoss`; `network`; `facility`), and a parts list beside the chart shows every part of the
compared point; the API keeps the twelve parts. Chips with measured
GPU power but no supported system model are named as not shown, not dropped silently.
On that tab the Count control names three measured boundaries, GPU only (`gpu-measured`),
IT (no PUE) (`it-modeled`) and Facility (`utility-modeled`), plus All; All
(`i_pcompare=boundaries`) draws those three per chip on the Power draw or Energy scatter
(GPU only solid, IT dashed, Facility dash-dot), and the legend, line labels, tooltips, table
and CSV call them GPU only, IT (no PUE) and Facility; the page has no further control layer.
Every power number on the tab carries a GPU, IT or Facility tag, explained in the tag's own
tooltip, and a readout row under the caption gives the hovered or pinned point's IT W per
GPU, GPUs per MW (1e6 ÷ IT W per GPU) and facility W per GPU at the model's PUE. The four
views are tabs above the plot; Count, Per and Show as, then Scope, Power statistic and
Rated boundaries (Off | All-in provisioned, `i_pcompare=provisioned`: GPU Level Measured
solid and All in Provisioned dashed per chip, nothing else) are plain Chart
Config controls, each shown only on the views where it applies; Split by sits in the Where
the power goes card.
Power draw shown as % of TDP shades each chip's headroom between its P90 draw and 100 % and
adds the headroom table (`headroom=true`) with a CSV download. On Where the power goes the
chip comparison stacks IT only by default; an Include facility switch (presentation only, no
API selector) appends the PUE part; the compared chip's across-load drill-down (stacked bars or
stacked area, `i_pbview`, stacked area by default) is open inline under its bar and follows the slider, and the view
itself is `i_pcompare=breakdown` (no boundary line chart; the boundaries are compared on Power
draw under Count: All). Chip rows keep a fixed order (registry hardware order, unofficial-run
lines after) whatever the slider reads. Clicking a column of the open drill-down pins that chip's
compared point to that column (`i_pbpoint`, `seriesKey:concurrency` pairs joined by commas,
only for pinned chips); the slider does not move and the other chips keep their slider-derived
point, moving the slider drops every pin, and a `×` marker on the row unpins one chip. This is
presentation over the `powerBreakdowns` rows the API already returns, not a selector. Over time adds a load-swing table per
trace (peak, min, idle floor, mean, P5/P95, max 1 s and 5 s change, ramp up/down, volatility),
a × 72 per NVL72 rack switch, and per-point CSV / JSON downloads served by
`/api/v1/gpu-metrics-point/stats` (`format=csv|json`, `scale=gpu|nvl72`), which computes the
same statistics from the same stored buckets. None of this adds `inference` view selectors.
A share link with `i_pcompare=all` (not offered by the UI) adds both provisioned bounds to the measured three. Inference Performance offers no power metrics: an `/inference` link with a
measured `metric`, or with a power-tier filter and no `metric`, opens `/powerx` with the same
filters (the latter on the Power draw scatter, `i_metric=y_measuredAvgPower`, as it used to chart power). Historical Trends keeps its measured power and energy metrics.
PowerX 仪表板标签页（`/powerx`、`/zh/powerx`）是 `inference` 视图的另一种呈现，不新增选择项；
芯片对比与单芯片下钻读取 `powerBreakdowns`；下钻图与对比横条把十二个部件合并为六层带斜线填充的分层（`gpu`；`measuredCpu`；服务器部件 `cpu` + `memory` + `nic` + `nvswitch` + `storage` + `other`；`fans` + `psuLoss`；`network`；`facility`），图旁的部件列表逐项列出对比点的各部件，API 仍返回十二个部件。没有受支持系统功耗模型的芯片会标注为未显示。
统计口径控件命名三个实测边界：仅 GPU（`gpu-measured`）、IT（不含 PUE）（`it-modeled`）与数据中心（`utility-modeled`），外加“全部”；“全部”（`i_pcompare=boundaries`）在功耗或能耗散点图上按芯片绘制这三条（仅 GPU 实线、IT 虚线、数据中心点划线），图例、曲线标签、提示框、表格与 CSV 也沿用这一叫法；页面不再有第二层控件。页面上每个功耗数值都带有 GPU / IT / 数据中心标签，含义见标签自身的提示框；标题行下方的读数行给出悬停或固定数据点的每 GPU IT 功耗、每 MW 可支持的 GPU 数（1e6 ÷ 每 GPU IT 功耗）以及按模型 PUE 计的每 GPU 数据中心功耗。四个视图为图表上方的标签页；统计口径、计量单位与显示方式，以及 GPU 范围、功耗统计量和额定边界（关闭 | 整体预配，`i_pcompare=provisioned`：每芯片仅绘制 GPU 实测功耗实线与整体预配功耗虚线两条线）都是图表配置中的普通控件，仅在适用的视图上显示；拆分方式位于“功耗去向”卡片中。“功耗”视图按 TDP 占比显示时，会在各芯片 P90 功耗与 100% 之间填充余量，并附带余量表（`headroom=true`）与 CSV 下载。“功耗去向”中芯片对比默认只堆叠 IT 部分；“计入数据中心开销”开关（仅为展示，不新增 API 选择项）追加 PUE 部分；所对比芯片的“随负载变化”下钻图（堆叠柱状图或堆叠面积图，`i_pbview`）默认即在其横条下方内联展开并随滑块切换芯片，该视图本身为 `i_pcompare=breakdown`（不再有功耗边界曲线图；边界对比位于“功耗”视图的“统计口径：全部”）。芯片行的顺序固定（按硬件注册表顺序，非官方运行的曲线排在其后），不随滑块变化。点击已展开下钻图中的某一列，会把该芯片的对比点固定在该列（`i_pbpoint`，以逗号分隔的 `seriesKey:concurrency`，仅包含已固定的芯片）；滑块不会移动，其他芯片仍按滑块取点，移动滑块会清除所有固定点，行上的 `×` 标记可单独取消该芯片的固定。这只是对 API 已返回的 `powerBreakdowns` 数据的展示方式，并非新的选择项。“随时间变化”新增每条曲线的负载波动表（峰值、最小值、空闲底线、均值、P5/P95、最大 1 秒与 5 秒变化、上升/下降速率、波动率）、“× 72（每 NVL72 机架）”开关，以及由 `/api/v1/gpu-metrics-point/stats`（`format=csv|json`、`scale=gpu|nvl72`）提供的逐点 CSV / JSON 下载，该接口用同一函数基于同一已存数据桶计算统计。这些都不新增 `inference` 视图的选择项。分享链接带 `i_pcompare=all`（界面不提供）时，会在三个实测边界之上加入两个额定边界。
Inference Performance 不再提供功耗指标：带实测 `metric`，或带功耗等级筛选但未指定 `metric` 的 `/inference` 链接会以相同筛选条件打开 `/powerx`（后者落在“功耗”散点图上，即 `i_metric=y_measuredAvgPower`，与其原先绘制功耗的行为一致）。Historical Trends 仍保留实测功耗与能耗指标。

These analytical results (`serviceCompare`, `roleShare`, `powerFit`, `powerBreakdown`, `headroom`) require JSON; enabling any with CSV returns 400. CSV exports plotted points except for All in Measured and its IT boundary, which export `tableRows`.

同等服务对比与同并发诊断仅通过 API 提供，查询参数为 `serviceCompare`、`serviceBaseline`、
`serviceComparator` 和 `serviceTarget`；仪表板没有对应的服务对比控件、来源选择、目标值输入、
同并发表格或分享参数。功耗拟合（`powerFit`）同样仅通过 API 提供；PowerX 标签页保留角色分析与系统功耗构成面板，分别对应 `roleShare`
和 `powerBreakdown`。功耗构成中只有 `gpu` 与 `measuredCpu` 为实测值，其余部分（`cpu`、`memory`、
`nic`、`nvswitch`、`storage`、`other`、`fans`、`psuLoss`、`network`、`facility`）为
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

### Landing-page Huawei link

The English and Chinese landing pages link Huawei Ascend 950PR results to
`/ubenchx/core-memory-profiles` and `/zh/ubenchx/core-memory-profiles`, respectively,
with the UbenchX subtitle. The logo and result button are presentation-only
navigation and do not prefetch OperatorX. The existing ubenchX API covers this
destination: `test=core-memory-profiles&gpu=all` returns Huawei Ascend first,
followed by B200, matching the page and hardware selector order.

中文：英文和中文首页的华为 Ascend 950PR 入口显示 UbenchX 副标题，分别链接至
`/ubenchx/core-memory-profiles` 和 `/zh/ubenchx/core-memory-profiles`。
Logo 和结果按钮仅用于导航，不再预取 OperatorX 数据。目标页面沿用现有 ubenchX API：
`test=core-memory-profiles&gpu=all` 先返回 Huawei Ascend，再返回 B200，与页面和硬件选择器顺序一致。

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

DeepSeek V4.1 Flash returns `encoderDecoder` with `encoderLayers: 20`,
`decoderLayers: 20`, `encoderSlidingOnlyLayers: 2`,
`globalKVSource: "final-encoder-hidden-states"`, and
`decoderAttention: "joint-local-swa-and-shared-global-kv"`.
`attentionLabel: "CSA2"` names the mechanism, and
`conditionalMemoryName: "Engram"` identifies the separate memory table.
The encoder is causal. Decoder attention combines shared encoder-derived global
KV with each layer's local sliding-window KV in one sparse-attention operation;
there is no separate T5-style cross-attention block. Prefill/decode active counts
remain separate, and conditional-memory parameters remain outside the backbone
count. Component-summary `diagramStages` cards are replaced by these structured
fields and expandable arrow diagrams.

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

### Model-specific architecture coverage

- `deepseek-r1`: read the model-specific architecture facts and source link with `model=deepseek-r1`.
- `deepseek-v4`: read the model-specific architecture facts and source link with `model=deepseek-v4`.
- `llama-3-3-70b`: read the model-specific architecture facts and source link with `model=llama-3-3-70b`.
- Hidden Llama 3.1 70B: use exact display name `Llama-3.1-70B-Instruct-FP8-KV`; its catalog slug is null.
- `gptoss-120b`: read the model-specific architecture facts and source link with `model=gptoss-120b`.
- `kimi-k3`: read the model-specific architecture facts and source link with `model=kimi-k3`.
- `minimax-m27`: read the model-specific architecture facts and source link with `model=minimax-m27`.
- `minimax-m3`: read the model-specific architecture facts and source link with `model=minimax-m3`.
- `minimax-m31-flash`: read the model-specific architecture facts and source link with `model=minimax-m31-flash`.
- `muse-spark-open`: read the model-specific architecture facts and source link with `model=muse-spark-open`.
- `deepseek-v41-flash`: read the model-specific architecture facts and source link with `model=deepseek-v41-flash`.
- `glm-5-1`: read the model-specific architecture facts and source link with `model=glm-5-1`.
- `glm-5-3`: read the model-specific architecture facts and source link with `model=glm-5-3`.
- `qwen-3-5`: read the model-specific architecture facts and source link with `model=qwen-3-5`.
- `qwen-3-8-flash-next`: read the model-specific architecture facts and source link with `model=qwen-3-8-flash-next`.
- `qwen-3-8-27b`: read the model-specific architecture facts and source link with `model=qwen-3-8-27b`.
- `qwen-3-8-27b-eager`: read the model-specific architecture facts and source link with `model=qwen-3-8-27b-eager`.

### GPU specification networking

`GET /api/v1/views/gpu-specs` shares its hardware source with `/gpu-specs` and the
English/Chinese chip pages. GB200 NVL72 includes ConnectX-7 400G InfiniBand NDR per
GPU; GB300 NVL72 includes ConnectX-8 800G InfiniBand XDR per GPU. Their inter-rack
switch/topology fields remain null (unspecified), not their NICs. The
`metric=scaleOutBandwidth` ranking includes 400 and 800 Gbit/s respectively, in JSON
and CSV. MI355X's scale-up technology is fourth-generation Infinity Fabric.
Chinese ownership-tier wording denotes owning hardware at hyperscaler purchase
volume, not a rental quote; the wording does not change the underlying TCO rates.

Vendor-series colors are presentation-only. Huawei/Ascend series use a shared, theme-aware amber identity across the chart generators; historical dates and high-contrast configurations may use related shades. Colors do not change API measurements, hardware identities, filters or normalization references. Sequential heatmap scales encode values rather than vendor identity.
