# Video performance history

`/video` and `/zh/video` lead with the cross-hardware dashboard (see [VideoGenX dashboard](./videogenx-dashboard.md)); the **Performance history** list described here sits in a collapsible section below it, which opens automatically when the URL carries a `history-*` filter (`history-hardware`, `history-concurrency`, `history-query`). Each entry links to its original GitHub Actions run. The earlier per-run viewer, trade-off chart and CI-run browser were removed with the dashboard rebuild; clips are compared in the dashboard's Compare panel.

## Read path

`GET /api/video-runs?format=history&page=1` returns a versioned UI projection of existing published H3 indexes. It lists `h3-video-media/v1/runs/` metadata, validates pathname identities, sorts by index publication time (artifact ID breaks ties), then reads at most ten indexes for one page. It neither downloads media nor calls the publication path. The repository visibility check still applies. This UI transport is not a stable public benchmark API.

The projection groups all cells under the original source inside one artifact entry. It reuses `storedBundle`, `servingCells`, `storedFidelityBundle`, and the existing tradeoff calculations. Invalid or unavailable indexes remain explicit error entries. Original execution time comes from `ci.started_at`; index publication time is separate and must never be substituted for execution time. Original run IDs and export run IDs remain distinct.

Two launchers produce the serving matrix, and `serving.ts` keys the contract on the manifest's `evidence_kind`. The legacy controlled GPU supervisor (`controlled_h3_gpu`) wrote `controlled_serving_smoke` receipts, device inventories, power-limit snapshots and fully timed request records. The native srt-slurm launcher (`srt_slurm_h3_service`, InferenceX #2916) writes `srt_slurm_h3_service_receipt` receipts that seal a `h3_native_power` document (`power.valid`, the receipt's `power.sha256` and the measurement phase must agree), per-cell InferenceX sidecars (`aggregate.json`, `benchmark_concurrency_<N>.json`; a `power_valid` of 0 or an `energy_normalization` other than `clips` withholds the number), and a matrix-level `power_verified` verdict shown on the source line. Native bundles name no GPU model: the projection reads `ci.site.gpu_model` when present, else the registry SKU in `ci.ci.runner_name`, else leaves the hardware empty. When an srt-client run record carries no per-request latency, the harness summary (`latency_median_seconds`, `valid_clips_per_second`, cross-checked against the matrix cell) stands in for P50 and throughput; P90 still needs the per-request population. Power that is not `valid` renders as not measured, never as a number.

Each observation also carries the cell's participating and allocated GPU counts, measurement wall seconds, clip duration and frame count, summed mean board watts, summed recorded enforced limits (null when no limit snapshot exists), the configured `tp_size` / `ulysses_degree` / `attention_backend` and the endpoint's replica count (`execution.deployment.replica_count`, null for bundles that predate it). The nullable `workloadKey` carries the full canonical workload identity when complete; prompts and seeds cannot be replaced by the shortened display label. These are additive, nullable fields under the same `schemaVersion: 1`; the hardware dashboard reads at most five pages and derives every displayed metric from them, so the browser never parses an artifact bundle for the chart.

## Evidence boundaries

- Only descriptive observations are shown: this version has no selected matched baseline and computes no before/after delta.
- Valid/completed/scheduled/failed counts stay separate. Missing or invalid metrics stay null. P90 retains the existing per-cell ten-sample display floor.
- Latency and throughput use the submission-to-downloaded-media window. Energy uses the recorded generation window and participating GPU boards. Board energy is not facility energy.
- Fidelity, calibration and release qualification are displayed independently. Stored/published does not mean qualified.
- Filters apply to loaded pages. The user can load older pages without losing already loaded entries. Global execution-time sorting and an editorial change/PR catalog require a later materialized catalog; the current implementation scans index metadata only, never all full indexes.

## Local replay

`E2E_FIXTURES=1` serves `cypress/fixtures/api/video-history.json` through the existing fixture loader and checksum manifest. The fixture is a metadata-only projection of retained H100/H200/B200 observations and two fidelity artifacts; it contains no infrastructure paths or video bytes. Unknown publication timestamps remain null. The response header `X-VideoGenX-Replay: 1` causes a visible replay notice. These are historical retained observations, not newly measured results or a new publication.

## 中文说明

`/video` 与 `/zh/video` 首屏为跨硬件仪表板（见 [VideoGenX 仪表板](./videogenx-dashboard.md)）；本文描述的“性能历史”列表位于其下方可展开的区块，URL 带有 `history-*` 筛选参数（`history-hardware`、`history-concurrency`、`history-query`）时自动展开。每条记录链接到原始 GitHub Actions 运行。原有的按运行查看结果、trade-off 图表与 CI 运行浏览已随仪表板重建移除；视频对比由仪表板的 Compare 面板提供。

历史读取只列举既有发布索引的元数据，按索引发布时间排序，每页最多读取十份完整索引；不下载或发布媒体。原始执行时间取自 `ci.started_at`，与发布时间、重新导出的时间分开。索引无效时保留错误记录，缺失指标保留 null。每个 cell 另附参与/已分配 GPU 数、测量窗口秒数、视频时长与帧数、板卡平均功率之和、记录的生效功率上限之和（无快照时为 null）、配置的 `tp_size` / `ulysses_degree` / `attention_backend`，以及端点的副本数（`execution.deployment.replica_count`，早于该记录的产物包为 null）；`workloadKey` 在信息完整时保留完整工作负载身份，prompts 与 seeds 不能由缩写显示标签替代。这些都是同一 `schemaVersion: 1` 下可为空的附加字段，硬件仪表板最多读取五页，并据此推导全部指标，浏览器不再解析产物包。

serving 矩阵有两种来源，`serving.ts` 按 manifest 的 `evidence_kind` 区分契约：旧的受控 GPU supervisor（`controlled_h3_gpu`）写入 `controlled_serving_smoke` 回执、设备清单、功率上限快照和带完整计时的请求记录；原生 srt-slurm launcher（`srt_slurm_h3_service`，InferenceX #2916）写入 `srt_slurm_h3_service_receipt` 回执，并对 `h3_native_power` 功率文档做封印（`power.valid`、回执中的 `power.sha256` 与测量阶段必须一致），同时附带每个 cell 的 InferenceX sidecar（`aggregate.json`、`benchmark_concurrency_<N>.json`；`power_valid` 为 0 或 `energy_normalization` 不是 `clips` 时不显示对应数值），矩阵级的 `power_verified` 结论显示在来源行。原生产物包不记录 GPU 型号：投影优先读取 `ci.site.gpu_model`，其次从 `ci.ci.runner_name` 中识别注册表 SKU，都没有时硬件留空。srt-client 的运行记录没有逐请求延迟时，以 harness 汇总（`latency_median_seconds`、`valid_clips_per_second`，并与矩阵 cell 交叉核对）代替 P50 与吞吐量；P90 仍需要逐请求样本。功率未通过 `valid` 校验时一律显示为未测得，不显示数字。

当前展示观测值，未选择匹配基线，也不计算 before/after。延迟、吞吐量使用提交到下载完成的窗口；板卡能耗使用记录的生成窗口。保真度、阈值校准、发布验收单独展示。筛选仅作用于已加载的页面，可继续加载较早结果。

`E2E_FIXTURES=1` 使用保留结果的脱敏元数据回放，遵循现有 fixture 校验和清单，并显示回放提示。未知发布时间保持为空；这不是新测量或新发布。
