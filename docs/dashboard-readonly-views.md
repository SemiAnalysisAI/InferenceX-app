# Dashboard read-only API coverage

The replacement for #901 starts from the repository default branch, master.
The implementation reuses the existing @semianalysisai/inferencex-skills package.
Every registered dashboard route is checked against DASHBOARD_API_COVERAGE by
registry.test.ts, including hidden and feature-gated routes.

## Exact query-key inventory

All endpoints are GET under /api/v1/views. Unsupported and repeated keys return 400.
This table records accepted query names; behavioral tests exercise representative
combinations, not the full Cartesian product of all possible filter values.

| View                            | Accepted query keys                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache-reuse`                   | `config`, `date`, `gpus`, `model`, `percentile`, `precisions`, `runId`, `sequence`, `tcoBasis`, `unofficialrun`                                                                                                                                                                                                                                                                                                                     |
| `calculator`                    | `costProvider`, `costType`, `costcap`, `date`, `format`, `gpus`, `hideSkuAboveConfigLimit`, `mode`, `model`, `mw`, `percentile`, `precisions`, `runId`, `sequence`, `target`, `tcoBasis`, `unofficialrun`                                                                                                                                                                                                                           |
| `collectivex`                   | `activeSeries`, `kvSeries`, `swapSeries`, `backend`, `epSize`, `kvOp`, `kvX`, `kvY`, `modes`, `operation`, `overlapIsl`, `pageTokens`, `percentile`, `phase`, `precision`, `runs`, `sku`, `suite`, `swapDirection`, `swapLayout`, `swapMetric`, `swapPercentile`, `version`, `yAxis`                                                                                                                                                |
| `compare`                       | `format`, `gpus`, `model`, `scenario`, `slug`, `tiers`, `variant`                                                                                                                                                                                                                                                                                                                                                                   |
| `current-inferencex-image`      | `asOf`, `frameworks`, `hardware`, `model`, `nodeType`, `precision`, `sequence`, `spec`                                                                                                                                                                                                                                                                                                                                              |
| `evaluation`                    | `unofficialrun`, `benchmark`, `date`, `format`, `gpus`, `model`, `precisions`                                                                                                                                                                                                                                                                                                                                                       |
| `first-token`                   | `caps`, `costProvider`, `costType`, `date`, `gpus`, `minInteractivity`, `model`, `percentile`, `precisions`, `runId`, `sequence`, `tcoBasis`, `unofficialrun`                                                                                                                                                                                                                                                                       |
| `fleet`                         | `cache`, `costProvider`, `costType`, `format`, `gpus`, `horizon`, `metric`, `model`, `mtbi`, `mw`, `oprice`, `percentile`, `precisions`, `price`, `ramp`, `recovery`, `sequence`, `target`, `tcoBasis`                                                                                                                                                                                                                              |
| `gpu-metrics`                   | `artifact`, `chartView`, `corrXMetric`, `corrYMetric`, `direction`, `downsample`, `gpus`, `metric`, `runId`, `sort`                                                                                                                                                                                                                                                                                                                 |
| `gpu-specs`                     | `format`, `metric`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `historical`                    | `deployment`, `end`, `extendToDate`, `format`, `frameworks`, `gpus`, `metric`, `model`, `precisions`, `priceSource`, `sequence`, `start`, `target`, `tcoBasis`, `vendors`                                                                                                                                                                                                                                                           |
| `inference`                     | `allPoints`, `best`, `date`, `dates`, `deployment`, `end`, `format`, `frameworks`, `gpus`, `metric`, `model`, `optimal`, `percentile`, `power`, `precisions`, `priceSource`, `runId`, `sequence`, `spec`, `start`, `tcoBasis`, `topologies`, `unofficialrun`, `userCosts`, `userPowers`, `vendors`, `xmetric`, `xmode`, `xstat`, `serviceCompare`, `serviceBaseline`, `serviceComparator`, `serviceTarget`, `roleShare`, `powerFit` |
| `operatorx`                     | `backend`, `cluster`, `metric`, `operator`, `page`, `precision`, `runId`, `shape`, `status`                                                                                                                                                                                                                                                                                                                                         |
| `options`                       | `format`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `overview`                      | `compare`, `engine`, `format`, `hwrows`, `models`, `ref`, `rows`, `tier`                                                                                                                                                                                                                                                                                                                                                            |
| `profit-estimator`              | `cachedInputPrice`, `costProvider`, `customCosts`, `date`, `dates`, `end`, `gpus`, `inputPrice`, `labCut`, `model`, `outputPrice`, `percentile`, `powerBasis`, `precisions`, `priceSource`, `runId`, `sequence`, `start`, `target`, `tcoBasis`, `unofficialrun`, `utilization`                                                                                                                                                      |
| `profit-estimator-per-gigawatt` | `cachedInputPrice`, `costProvider`, `customCosts`, `date`, `dates`, `end`, `gpus`, `inputPrice`, `labCut`, `model`, `outputPrice`, `percentile`, `powerBasis`, `precisions`, `priceSource`, `runId`, `sequence`, `start`, `target`, `tcoBasis`, `unofficialrun`, `utilization`                                                                                                                                                      |
| `rankings`                      | `format`, `kind`, `model`, `scenario`                                                                                                                                                                                                                                                                                                                                                                                               |
| `reliability`                   | `asOf`, `format`, `gpus`, `range`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `submissions`                   | `direction`, `limit`, `lines`, `mode`, `offset`, `onChangeOnly`, `search`, `sort`                                                                                                                                                                                                                                                                                                                                                   |
| `video`                         | `artifact`, `cell`, `compare`, `costs`, `gpuBasis`, `page`, `phase`, `run`, `selected`, `slot`, `source`, `view`, `workload`, `xAxis`, `yAxis`                                                                                                                                                                                                                                                                                      |

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

The `/inference` Power Timeline is a different surface from the raw `gpu-metrics`
explorer. Its existing read-only `/api/gpu-metrics?series=power` source returns
one-second per-device buckets, role assignments and validation-source identities;
benchmark `power_audit` supplies the exact serving-window bounds. The public
`/api/v1/views/gpu-metrics` projection alone does not return that combined evidence
and must not be described as a serving-window or role-pool projection.

Timeline share fields `i_ptaxis`, `i_ptlines`, `i_ptwindow`, `i_ptfocus`, `i_ptutility`
and `i_ptconc` are renderer state, not parameters of the raw explorer API. `i_ptconc`
keeps the chart's rows at one concurrency, so platforms can be read at one load. Window-only
display selects retained bucket timestamps within the recorded inclusive bounds;
serving-relative display uses `(bucket UTC ms - window start UTC ms) / 1000`.
Missing, nonfinite or non-increasing bounds omit that trace in either mode.
No boundary samples are interpolated, and no stored window statistics or energy
values are recomputed. Per-GPU/mean/role-pool modes reuse the existing device identity
and pool-sum calculations. Focus only dims other traces and the utility toggle only
adds registry references. The validated-window summary below the chart lists each
trace's run, attempt, validation file and per-run telemetry source (database, or
GitHub artifact fallback when any requested series was read live), then per pool the
row's validated average as stored, the largest drawn pool bucket inside the window,
and GPUs × registry TDP. Raw telemetry, full-record statistics and API responses
are unchanged by all six display settings. The reusable client helpers are
`parsePowerTimelineParams`, `powerTimelineSampleX` and `tracePools` in
`components/inference/utils/powerTimeline.ts`, and `sumPowerAt` in
`components/gpu-power/power-series.ts`.

## Fixed-sequence service comparisons

The inference view exposes the same mean/median selector as the dashboard through
`xstat=median|mean` (default median). Mean streaming speed is **1 / mean TPOT**;
it is not the arithmetic mean of per-request speeds. Mean TTFT and E2E use their
recorded mean values. Missing means remain missing; the view never substitutes a
median. AgentX keeps its selected `percentile`, and concurrency has no statistic:
`params.xstat` resolves to null in both cases, while `xAxis.statistic` records the
effective percentile or null.

`serviceCompare=true` adds `serviceSources`, `equalServiceCurve`, and (when
`serviceTarget` is present) `equalServiceComparison`. Select exact opaque
`serviceBaseline` and `serviceComparator` keys returned by `serviceSources`,
encoded with `URLSearchParams`; omitted selections use its first two entries.
Stale explicit selections remain unavailable. Missing target returns null, not an
invented operating point. Streaming-speed targets are tok/s/user; TTFT/E2E targets
are seconds. Concurrency remains a separate observed-load diagnostic, not an
equal-service comparison axis.

That diagnostic is `matchedConcurrency`, also returned by `serviceCompare=true`: the
two selected sources paired at every concurrency either one observed. Each side is
`observed` (J/output token, mean W/GPU and streaming speed at the selected statistic,
named by `interactivityField`, plus its point identity), `missing`, or `ambiguous`
when one source's observations at that load disagree; all are listed and none is
chosen. `changePercent` is `100 × (comparator / baseline − 1)` only when both sides
were observed. Same-load pairs usually serve different speeds, so the table sits
beside the equal-service comparison rather than replacing it.

The dashboard and API share `equal-service-comparison.ts`: both consume scoped
observed points after chart coverage/limits, before frontier and best-per-SKU
pruning, with power-comparison clones excluded. `allPoints=true` restores clipped
observations. Source keys retain hardware, precision, exact run, actual source
date, recipe, topology and workload identity; changing display dates does not
create a new measured source. Comparisons never join different sources into one
interpolation bracket. All three metrics use bounded numerical linear
interpolation of the underlying quantities, then compute
`100 × (comparator / baseline − 1)`. No log-axis interpolation, extrapolation,
missing-endpoint bridging or averaging of conflicting duplicate x-values occurs.

Metrics are mean measured GPU board W/GPU, whole-deployment output tokens/s, and
validated measured GPU J/output token. Each estimate returns its bracket point
IDs, source/run/topology/recipe identities, endpoint x/value, and whether it was
interpolated. Unavailable comparisons return explicit reasons and null metrics,
not zero. This is an operating-point comparison, not proof of a hardware-only
causal effect. Official, historical and unofficial source identities remain
visible.

`roleShare=true` returns `roleEnergyShares` and `rolePoints` through the same shared
role helper. Each role point carries prefill and decode mean W/GPU, role-local
prefill J/input and decode J/output, and the output-token reconstruction below;
any missing figure is null.
Validated disaggregated prefill J/input is multiplied by same-window aggregate
J/output ÷ J/input, then compared with decode J/output. The percentage denominator
is reconstructed prefill + decode energy on one output-token basis. Missing or
invalid role measurements are omitted. This view does not mix pool-local token
denominators or claim the reconstructed sum was independently measured.

`powerFit=true` returns `powerFits`: per source, an ordinary least-squares line of
measured mean W/GPU (over all allocated GPUs) against whole-deployment output tok/s
per allocated GPU. Each fit reports intercept `P₀`, slope `m` (J/output token), R²,
n and the fitted x-range, plus registry `tdpWatts` and every observation with its
point identity. Fewer than three distinct output rates return `fit: null` with
`reason: "too-few-points"`. `P₀` is an extrapolated intercept, not measured idle
power, and R² is null when power did not vary.

These panel results are JSON-only: `format=csv` with any panel enabled returns
400, rather than silently exporting only the primary chart. Ordinary CSV retains
its existing plotted-point contract. Share controls map directly:
`i_mstat` → `xstat`, `i_servicecompare` → `serviceCompare`, `i_servicebase` →
`serviceBaseline`, `i_servicepeer` → `serviceComparator`, `i_servicetarget` →
`serviceTarget`, `i_roleshare` → `roleShare`, and `i_powerfit` → `powerFit`.

The scatter chart's Frontier points table (shown with `i_frontier` on a measured
power metric) lists the drawn cross-platform frontier with each point's run and
attempt, and exports it as CSV. The views API has no global-frontier parameter, so
that table remains dashboard-only.

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

`/inference` 的 Power Timeline 与原始 `gpu-metrics` 浏览器是两个不同视图。
时间线通过现有只读 `/api/gpu-metrics?series=power` 获取逐秒采样、设备角色和验证来源，
再结合基准测试 `power_audit` 中的服务窗口边界；公开的 `/api/v1/views/gpu-metrics`
本身不返回这组完整证据，不能称为服务窗口或 GPU 池投影视图。
六个 `i_pt*` 分享字段只控制显示，不是原始浏览器 API 的参数；`i_ptconc` 只保留同一并发数的
行，便于在同一负载下对照多个平台。窗口模式仅显示已记录
边界内的采样点（含边界），服务起点模式将 UTC 时间减去窗口起点后换算为秒。
边界缺失、非有限值或结束不晚于开始时，不绘制对应曲线；不插值补点，也不重算已存储的
窗口统计或能耗。图下的有效测量窗口汇总列出每条曲线的运行、尝试次数、验证文件和
遥测来源（数据库，或有序列需实时读取时的 GitHub 产物回退），并按 GPU 池列出基准测试行
存储的有效平均值、窗口内所绘曲线的最大值，以及 GPU 数 × 注册表 TDP。GPU 池模式复用已有设备角色和求和函数；聚焦仅调暗其他曲线，参考线
使用硬件注册表。原始遥测、全记录统计和 API 响应均不因这些显示设置而改变。
响应使用 private, no-store，上游 503 保留为错误响应。

`serviceCompare=true` 还返回 `matchedConcurrency`：按并发数逐行配对两个所选数据源，任一方在
该并发数下有观测即列出一行；每侧为 `observed`、`missing`，或同一负载下观测值不一致时的
`ambiguous`（全部列出、不选其一）；仅当两侧都有观测时才计算变化百分比。同一并发下两者
的服务速度通常不同，因此该表只作诊断，不替代同等服务对比。`roleShare=true` 另返回
`rolePoints`（各角色 W/GPU、按本池 token 计的能耗及按输出 token 重建的能耗）。
`powerFit=true` 返回 `powerFits`：每个数据源以最小二乘法拟合平均 W/GPU 与每个已分配
GPU 的输出 tok/s，给出 `P₀`、`m`（J/输出 token）、R²、点数、拟合范围和注册表 TDP；
不同输出速率少于 3 个时不拟合。`P₀` 是外推截距，不是实测空载功耗。这些面板只支持
JSON；`i_powerfit` 对应 `powerFit`。散点图的前沿点表（`i_frontier` 开启且为实测功耗
指标时显示）列出跨平台前沿各点的运行和尝试次数，并可导出 CSV；只读 API 没有全局前沿
参数。

测试覆盖契约同步及代表性的筛选行为，并未穷举所有参数组合。生产数据库上的
完整 UI/API 对照仍需集成审查，不能仅凭单元测试宣称已完成。
