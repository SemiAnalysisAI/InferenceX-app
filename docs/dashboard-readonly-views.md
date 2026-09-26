# Dashboard read-only API coverage

The replacement for #901 starts from the repository default branch, master.
The implementation reuses the existing @semianalysisai/inferencex-skills package.
Every registered dashboard route is checked against DASHBOARD_API_COVERAGE by
registry.test.ts, including hidden and feature-gated routes.

## Exact query-key inventory

All endpoints are GET under /api/v1/views. Unsupported and repeated keys return 400.
This table records accepted query names; behavioral tests exercise representative
combinations, not the full Cartesian product of all possible filter values.

| View                            | Accepted query keys                                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache-reuse`                   | `config`, `date`, `gpus`, `model`, `percentile`, `precisions`, `runId`, `sequence`, `tcoBasis`, `unofficialrun`                                                                                                                                                                                          |
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
| `operatorx`                     | `backend`, `cluster`, `metric`, `operator`, `page`, `precision`, `runId`, `shape`, `status`                                                                                                                                                                                                              |
| `options`                       | `format`                                                                                                                                                                                                                                                                                                 |
| `overview`                      | `compare`, `engine`, `format`, `hwrows`, `models`, `ref`, `rows`, `tier`                                                                                                                                                                                                                                 |
| `profit-estimator`              | `cachedInputPrice`, `costProvider`, `customCosts`, `date`, `dates`, `end`, `gpus`, `inputPrice`, `labCut`, `model`, `outputPrice`, `percentile`, `powerBasis`, `precisions`, `priceSource`, `runId`, `sequence`, `start`, `target`, `tcoBasis`, `unofficialrun`, `utilization`                           |
| `profit-estimator-per-gigawatt` | `cachedInputPrice`, `costProvider`, `customCosts`, `date`, `dates`, `end`, `gpus`, `inputPrice`, `labCut`, `model`, `outputPrice`, `percentile`, `powerBasis`, `precisions`, `priceSource`, `runId`, `sequence`, `start`, `target`, `tcoBasis`, `unofficialrun`, `utilization`                           |
| `rankings`                      | `format`, `kind`, `model`, `scenario`                                                                                                                                                                                                                                                                    |
| `reliability`                   | `asOf`, `format`, `gpus`, `range`                                                                                                                                                                                                                                                                        |
| `submissions`                   | `direction`, `limit`, `lines`, `mode`, `offset`, `onChangeOnly`, `search`, `sort`                                                                                                                                                                                                                        |
| `video`                         | `artifact`, `cell`, `compare`, `costs`, `gpuBasis`, `page`, `phase`, `run`, `selected`, `slot`, `source`, `v_x`, `v_y`, `v_tier`, `v_view`, `v_optimal`, `v_api`, `v_hidden`, `v_base`, `v_cand`, `v_case`, `view`, `workload`, `xAxis`, `yAxis`                                                         |

## Source audit and shared computations

- Inference: global/date/quick-filter contexts, metric registry, useChartData,
  Pareto selection, compare-date parsing and trace-derived normalized metrics.
- Calculator family: useThroughputData, interpolation, first-token-limits,
  cache-reuse, profit-estimator/profit-power, historical-best and fleet economics.
- History: useInterpolatedTrendData, shared grouping and line extension.
- Evaluation/reliability: chart-data, date resolution and rolling aggregation.
- OperatorX/CollectiveX: selected operator sweep, EP/KV/swap chart and fit helpers.
- Submissions/images: existing table, weekly/cumulative and image freshness helpers.
- GPU metrics: shared line/correlation transforms and unsampled statistics.
- Video: published history pages → videoPoints → dashboardCells → shared metrics,
  deployment Pareto plot/table, lead-cell KPIs, Compare and measured evidence.
  Legacy checksum-verified bundle serving/fidelity and tradeoff reads remain available.
- Overview/rankings/compare: existing discovery-page assembly and scenario helpers.

## VideoGenX dashboard contract

`GET /api/v1/views/video` defaults to the current `/video` dashboard. The shared
`VIDEO_HISTORY_MAX_PAGES` bounds both UI and API to the first five published
history pages; responses report `coverage` with `pagesRead`, `maxPages`,
`nextPage` and `truncated`. This is a publication-ordered window, not an execution
date range or a promise to enumerate the entire catalog. Failures remain failures;
missing fields remain null. Source run/artifact IDs, seals and distinct execution
and publication times remain in `provenance`; raw documents, private asset URLs
and credentials are excluded from the dashboard projection.

| UI control or surface    | Public projection / scope                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X/Y, cost tier, optimal  | `v_x`, `v_y`, `v_tier`, `v_optimal`; same metric registry, participating-GPU cost basis and per-hardware frontier helpers. Queueing cells never enter `plot`/`rows`.                                                                                                                                                                                                                                           |
| Hardware visibility      | `v_hidden`, sorted/deduplicated known roster keys; affects plot/table only, matching UI. KPI, Compare and Evidence retain all selected-workload cells.                                                                                                                                                                                                                                                         |
| API reference price      | `v_api`, positive USD/video-second rounded to four decimals; only `apiPricePerVideo`, never TCO or revenue. Invalid values use the UI reference.                                                                                                                                                                                                                                                               |
| Chart/table              | `v_view`; echoed as `params.displayView`, no numerical difference. Color, zoom and playback remain presentation state.                                                                                                                                                                                                                                                                                         |
| Workload/newest cell     | `videoPoints` → `dashboardCells`; same canonical identity, sample floor and publication precedence. Return `workload`, `otherWorkloads`, cells and source provenance.                                                                                                                                                                                                                                          |
| KPI cards                | `kpis`: roster entries, shared lead cell and all metric values; missing hardware keeps null point/metrics.                                                                                                                                                                                                                                                                                                     |
| Compare selectors/deltas | `v_base`, `v_cand`, `v_case`; shared selection defaults and `compareMetrics`. Default mode returns deltas without loading media.                                                                                                                                                                                                                                                                               |
| Case media metadata      | `view=compare` adds at most two published-only `format=published` reads (deduplicated by run/artifact), `compareSide`/`pairCases`, bounded `resolvedCaseIndex`, matched/unmatched counts and selected records. Only bundle-relative media paths are exposed. Missing media, missing baseline/candidate and read errors have separate statuses; `ready` means readable artifacts and can still have zero pairs. |
| Evidence                 | Shared power/plateau/scaling/facts functions. Descriptive measurements; no quality qualification or causal bottleneck inference.                                                                                                                                                                                                                                                                               |
| Legacy run browser       | Explicit `view=discovery&page=…`; supplying `run`/`artifact` retains results and optional tradeoff selectors. Mixing legacy selectors and `v_*` returns 400.                                                                                                                                                                                                                                                   |

Dashboard state values use the UI parser and its fallback defaults; unknown or
repeated parameter names return 400. Legacy source status handling and 204 behavior
remain unchanged. Chart history read failures preserve the sanitized upstream status;
optional Compare media failure returns `comparison.cases.status=unavailable` without
erasing independently available chart data. The route and generated OpenAPI remain
no-store.

Regression coverage exercises numerical API/UI parity across default and changed
axes/tier/optimal/price/visibility, the shared five-page bound, legacy reads,
case-index clamping, absent/failed media and private-URL exclusion. This does not
claim live production API/UI equivalence or full-history completeness.

### 中文说明

视频公开接口默认复现当前仪表板：最多读取前五页已发布历史，复用相同的 workload、
样本门槛、部署和数值计算，明确返回覆盖范围与截断状态。`v_hidden` 只隐藏图表和表格
中的硬件，KPI、Compare 和 Evidence 保持原范围；`v_api` 只是视频秒参考价，不是
TCO 或收益。默认不加载媒体；`view=compare` 才读取最多两份已发布媒体产物并返回
匹配用例、实际索引和未配对数量，不暴露 asset URL 或原始数据包。`view=discovery`
及原有 run/artifact 查询仍可使用；不能与 `v_*` 混用。未发布、无可比较双方和读取失败
分别标记，不能解释为成功的空测量。该接口不承诺完整历史、质量验收或瓶颈因果结论。

## Other public surfaces

Model, chip and pair discovery pages reuse overview/rankings/compare calculations.
Localized /zh pages and embeds reuse the same numerical API, not separate copies.
AgentX point drilldowns retain the existing public availability, derived metrics,
aggregates, histograms, request timeline, server metrics and log APIs.
The AI-chart data source maps to inference; private provider keys, prompts and
locally generated assets do not become public API data. Feedback is sensitive.
Zoom, theme, axis scale, labels, media playback and report expansion are renderer
state. GPU interactive downsampling does not alter returned raw data or statistics.

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

测试覆盖契约同步及代表性的筛选行为，并未穷举所有参数组合。生产数据库上的
完整 UI/API 对照仍需集成审查，不能仅凭单元测试宣称已完成。
