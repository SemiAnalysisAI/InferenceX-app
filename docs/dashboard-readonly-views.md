# Dashboard read-only API coverage

The replacement for #901 starts from the repository default branch, master.
The implementation reuses the existing @semianalysisai/inferencex-skills package.
Every registered dashboard route is checked against DASHBOARD_API_COVERAGE by
registry.test.ts, including hidden and feature-gated routes.

## Static editorial content

`/blog/sparse-savings-persistent-demand-inside-glm53` and its `/zh/blog/` sibling
reproduce the public GLM-5.3 newsletter article, with the September 28, 2026
benchmark snapshot and original figures. They add no data selectors, calculations,
or API contracts. Existing `/llms.txt`, `/llms-full.txt`, `/feed.xml`, and sitemap
handlers discover the post through the shared blog registry. The subscriber-only
continuation stays on the newsletter and is not included in these feeds.
Use the existing inference, first-token, and cache-reuse view contracts for live
data; do not interpret the historical article figures as current API results.

## Standalone ubenchX pages

`/ubenchx` (Beta) is linked from the header navigation and redirects to `/ubenchx/mem-bw`.
Each test page (`/ubenchx/mem-bw`, `/ubenchx/sm-l2-distance`, plus `/zh` siblings) shares a
header whose Microbenchmark selector navigates between tests; it maps to the view's `test`
parameter rather than adding a new one. They are not
dashboard tabs, so they have no `DASHBOARD_API_COVERAGE` entry. Their data is published
by the `ubenchx` view (`GET /api/v1/views/ubenchx?test=<test>&gpu=<gpu|all>`), which
runs the same `transformUbenchxRun` and `transformSmL2Run` as the pages. The mem-bw
Y-axis selector (MBU, bandwidth, latency) is presentation-only: every view response
already includes all three metrics, so it adds no query parameter.

## Exact query-key inventory

All endpoints are GET under /api/v1/views. Unsupported and repeated keys return 400.
This table records accepted query names; behavioral tests exercise representative
combinations, not the full Cartesian product of all possible filter values.

| View                            | Accepted query keys                                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache-reuse`                   | `config`, `date`, `gpus`, `model`, `percentile`, `precisions`, `recipe`, `runId`, `sequence`, `tcoBasis`, `unofficialrun`                                                                                                                                                                                |
| `calculator`                    | `costProvider`, `costType`, `costcap`, `date`, `format`, `gpus`, `hideSkuAboveConfigLimit`, `mode`, `model`, `mw`, `percentile`, `precisions`, `runId`, `sequence`, `target`, `tcoBasis`, `unofficialrun`                                                                                                |
| `collectivex`                   | `activeSeries`, `kvSeries`, `swapSeries`, `backend`, `epSize`, `kvOp`, `kvX`, `kvY`, `modes`, `operation`, `overlapIsl`, `pageTokens`, `percentile`, `phase`, `precision`, `runs`, `sku`, `suite`, `swapDirection`, `swapLayout`, `swapMetric`, `swapPercentile`, `version`, `yAxis`                     |
| `compare`                       | `format`, `gpus`, `model`, `scenario`, `slug`, `tiers`, `variant`                                                                                                                                                                                                                                        |
| `current-inferencex-image`      | `asOf`, `frameworks`, `hardware`, `model`, `nodeType`, `precision`, `sequence`, `spec`                                                                                                                                                                                                                   |
| `evaluation`                    | `unofficialrun`, `benchmark`, `date`, `format`, `gpus`, `model`, `precisions`                                                                                                                                                                                                                            |
| `first-token`                   | `caps`, `costProvider`, `costType`, `date`, `gpus`, `minInteractivity`, `model`, `percentile`, `precisions`, `runId`, `sequence`, `tcoBasis`, `unofficialrun`                                                                                                                                            |
| `fleet`                         | `cache`, `costProvider`, `costType`, `format`, `gpus`, `horizon`, `metric`, `model`, `mtbi`, `mw`, `oprice`, `percentile`, `precisions`, `price`, `ramp`, `recovery`, `sequence`, `target`, `tcoBasis`                                                                                                   |
| `gpu-metrics`                   | `artifact`, `chartView`, `corrXMetric`, `corrYMetric`, `direction`, `downsample`, `gpus`, `metric`, `runId`, `sort`                                                                                                                                                                                      |
| `gpu-specs`                     | `format`, `metric`                                                                                                                                                                                                                                                                                       |
| `historical`                    | `deployment`, `end`, `extendToDate`, `format`, `frameworks`, `gpus`, `metric`, `model`, `precisions`, `priceSource`, `sequence`, `start`, `target`, `tcoBasis`, `vendors`                                                                                                                                |
| `inference`                     | `allPoints`, `best`, `date`, `dates`, `deployment`, `end`, `format`, `frameworks`, `gpus`, `metric`, `model`, `optimal`, `percentile`, `power`, `precisions`, `priceSource`, `runId`, `sequence`, `spec`, `start`, `tcoBasis`, `unofficialrun`, `userCosts`, `userPowers`, `vendors`, `xmetric`, `xmode` |
| `options`                       | `format`                                                                                                                                                                                                                                                                                                 |
| `overview`                      | `compare`, `engine`, `format`, `hwrows`, `models`, `ref`, `rows`, `tier`                                                                                                                                                                                                                                 |
| `profit-estimator`              | `cachedInputPrice`, `costProvider`, `customCosts`, `date`, `dates`, `end`, `gpus`, `inputPrice`, `labCut`, `model`, `outputPrice`, `percentile`, `powerBasis`, `precisions`, `priceSource`, `runId`, `sequence`, `start`, `target`, `tcoBasis`, `unofficialrun`, `utilization`                           |
| `profit-estimator-per-gigawatt` | `cachedInputPrice`, `costProvider`, `customCosts`, `date`, `dates`, `end`, `gpus`, `inputPrice`, `labCut`, `model`, `outputPrice`, `percentile`, `powerBasis`, `precisions`, `priceSource`, `runId`, `sequence`, `start`, `target`, `tcoBasis`, `unofficialrun`, `utilization`                           |
| `rankings`                      | `format`, `kind`, `model`, `scenario`                                                                                                                                                                                                                                                                    |
| `reliability`                   | `asOf`, `format`, `gpus`, `range`                                                                                                                                                                                                                                                                        |
| `submissions`                   | `direction`, `limit`, `lines`, `mode`, `offset`, `onChangeOnly`, `search`, `sort`                                                                                                                                                                                                                        |
| `ubenchx`                       | `gpu`, `test`                                                                                                                                                                                                                                                                                            |
| `video`                         | `artifact`, `cell`, `compare`, `costs`, `gpuBasis`, `page`, `phase`, `run`, `selected`, `slot`, `source`, `view`, `workload`, `xAxis`, `yAxis`                                                                                                                                                           |

Cache reuse returns `data.recipes` and the resolved `params.recipe`. Pass a returned key as `recipe` (the UI uses `c_recipe`) to select the same TP/EP/DP-attention, worker, GPU, speculation, offload and fingerprint combination. Omitted or stale keys use the shared dashboard default. Runs use that recipe if available, otherwise their own best-covered recipe; inspect each bar's source row for its identity. Overlay-only configurations expose their own recipe choices. Layout orientation and label placement are presentation-only controls.

## Source audit and shared computations

The inference run selector uses the same `DISPLAY_MODEL_TO_DB` aliases as benchmark
queries. For example, the `GLM-5.2` display/API model includes raw `glm5.2` and
`glm5.3` rows. `/api/v1/workflow-info` remains date-scoped across models; the UI
filters its changelog keys by those aliases and the selected precision. This
alignment changes no API parameters, response schemas, or stored model identities.

- Inference: global/date/quick-filter contexts, metric registry, useChartData,
  Pareto selection, compare-date parsing and trace-derived normalized metrics.
- Calculator family: useThroughputData, interpolation, first-token-limits,
  cache-reuse, profit-estimator/profit-power, historical-best and fleet economics.
- History: useInterpolatedTrendData, shared grouping and line extension.
- Evaluation/reliability: chart-data, date resolution and rolling aggregation.
- CollectiveX: selected EP/KV/swap chart and fit helpers.
- Submissions/images: existing table, weekly/cumulative and image freshness helpers.
- GPU metrics: shared line/correlation transforms and unsampled statistics.
- Video: checksum-verified stored bundles, serving/fidelity selectors and tradeoffs.
- Overview/rankings/compare: existing discovery-page assembly and scenario helpers.

## Other public surfaces

Model, chip and pair discovery pages reuse overview/rankings/compare calculations.
Localized /zh pages and embeds reuse the same numerical API, not separate copies.
AgentX point drilldowns retain the existing public availability, derived metrics,
aggregates, histograms, request timeline, server metrics and log APIs.
The AI-chart data source maps to inference; private provider keys, prompts and
locally generated assets do not become public API data. Feedback is sensitive.
OperatorX is feature-gated in navigation and uses page-owned
`/api/v1/operatorx/*` routes; it has no published `/api/v1/views/operatorx`
contract.
The Agentic Workload Explorer is feature-gated in navigation and reads a frozen,
anonymized ProxyTrace snapshot from a separate database through page-owned
`/api/v1/agentic-workload-explorer/*` routes (catalogued as `page-bff`); it has
no published `/api/v1/views/agentic-workload-explorer` contract.
Zoom, theme, axis scale, labels, media playback and report expansion are renderer
state. GPU interactive downsampling does not alter returned raw data or statistics.

Run-specific recognition labels are also presentation-only. Runs `35879254139`
and `37181045340` display `UMBP MoRI SGLang` through October 9, 2026 in America/New_York
(`2026-10-10T04:00:00Z` exclusive). Label resolution after that cutoff returns
`MoRI SGLang`; an already-open memoized chart may need a refresh. This changes
neither API selectors nor response data, framework/hardware keys, or raw CSV
exports, so no API or OpenAPI contract change is required.

## Verification scope

Route tests cover baseline views and selected extension behavior, including
unknown/repeated keys, impossible dates, unsafe IDs, exact-run forwarding,
unofficial source separation, no-store artifacts and shared projection outputs.
The contract ledger checks handler discovery, documentation parity and source
digests. Existing numerical helper suites exercise their interpolation/frontier/
economics rules. Live production database equivalence and every possible filter
combination require deployment/integration review; unit tests alone do not prove
those properties.

## 中文说明

本次替代 #901 的改动基于仓库默认分支 master，继续使用现有
@semianalysisai/inferencex-skills 包。所有仪表板路由（含隐藏和功能开关控制的
视图）均在覆盖表中登记；上表列出各只读接口接受的全部查询参数名。
接口复用现有计算函数，公开运行与非官方叠加数据保留各自来源。
私有上传、密钥、提示词、反馈及管理操作不作为公开读取接口。
OperatorX 的入口受功能开关控制，页面使用专属的 `/api/v1/operatorx/*`
接口；目前没有发布 `/api/v1/views/operatorx` 契约。
Agentic Workload Explorer 的入口同样受功能开关控制，它通过页面专属的
`/api/v1/agentic-workload-explorer/*` 接口（在路由目录中归类为 `page-bff`）
从独立数据库读取冻结的匿名 ProxyTrace 快照；目前没有发布
`/api/v1/views/agentic-workload-explorer` 契约。

测试覆盖契约同步及代表性的筛选行为，并未穷举所有参数组合。生产数据库上的
完整 UI/API 对照仍需集成审查，不能仅凭单元测试宣称已完成。
