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
| `video`                         | `artifact`, `cell`, `compare`, `costs`, `gpuBasis`, `page`, `phase`, `run`, `selected`, `slot`, `source`, `view`, `workload`, `xAxis`, `yAxis`                                                                                                                                                           |

## Source audit and shared computations

- Inference: global/date/quick-filter contexts, metric registry, useChartData,
  Pareto selection, compare-date parsing and trace-derived normalized metrics.
- Calculator family: useThroughputData, interpolation, first-token-limits,
  cache-reuse, profit-estimator/profit-power, historical-best and fleet economics.
- History: useInterpolatedTrendData, shared grouping and line extension.
- Evaluation/reliability: chart-data, date resolution and rolling aggregation.
- OperatorX/CollectiveX: selected operator sweep, EP/KV/swap chart and fit helpers.
- Submissions/images: existing table, weekly/cumulative and image freshness helpers.
- GPU metrics: shared line/correlation transforms and stored full-record per-GPU
  digests. Live artifacts alone calculate statistics from samples; empty stored
  digests remain empty. File/host identity and missing-versus-zero semantics persist.
- Video: checksum-verified stored bundles, serving/fidelity selectors and tradeoffs.
- Overview/rankings/compare: existing discovery-page assembly and scenario helpers.

## Other public surfaces

Model, chip and pair discovery pages reuse overview/rankings/compare calculations.
Localized /zh pages and embeds reuse the same numerical API, not separate copies.
AgentX point drilldowns retain the existing public availability, derived metrics,
aggregates, histograms, request timeline, server metrics and log APIs.
The AI-chart data source maps to inference; private provider keys, prompts and
locally generated assets do not become public API data. Feedback is sensitive.
Zoom, theme, axis scale, labels, media playback and report expansion are renderer
state. GPU interactive downsampling does not alter returned raw data or statistics.
The GPU statistics table includes startup and warmup for all chips in the selected
series, regardless of chip visibility. It is separate from serving-window power,
J/token and selected-time-window calculations. Run telemetry is DB-first with an
artifact fallback for missing storage; the public view returns private, no-store
responses and preserves upstream 503 failures.

Run-specific recognition labels are also presentation-only. Run `35879254139`
displays `UMBP MoRI SGLang` through October 9, 2026 in America/New_York
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
GPU 视图优先读取已存遥测，缺少存储数据时回退到产物。全记录统计使用所选文件、
主机序列的全部芯片摘要，包含启动与 warmup；已有摘要为空时不补算，缺失读数不补零。
芯片显隐和图表降采样不改变该统计，也不改变 serving-window 或 J/token 的计算口径。
响应使用 private, no-store，上游 503 保留为错误响应。

测试覆盖契约同步及代表性的筛选行为，并未穷举所有参数组合。生产数据库上的
完整 UI/API 对照仍需集成审查，不能仅凭单元测试宣称已完成。
