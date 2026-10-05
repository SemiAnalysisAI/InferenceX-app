# Video performance history

`/video` and `/zh/video` lead with the cross-hardware dashboard (see [VideoGenX dashboard](./videogenx-dashboard.md)); the **Performance history** list described here sits in a collapsible section below it, which opens automatically when the URL carries a `history-*` filter (`history-hardware`, `history-concurrency`, `history-query`). Each entry links to its original GitHub Actions run. The earlier per-run viewer, trade-off chart and CI-run browser were removed with the dashboard rebuild; clips are compared in the dashboard's Compare panel.

## Read path

`GET /api/video-runs?format=history&page=1` returns a versioned UI projection of existing published video indexes. It lists `h3-video-media/v1/runs/` metadata, validates pathname identities, sorts by index publication time (artifact ID breaks ties), then reads at most ten indexes for one page. It neither downloads media nor calls the publication path. The repository visibility check still applies. This UI transport is not a stable public benchmark API.

The projection groups all cells under the original source inside one artifact entry. It reuses `storedBundle`, `servingCells`, `storedFidelityBundle`, and the existing tradeoff calculations. Invalid or unavailable indexes remain explicit error entries. Original execution time comes from `ci.started_at`; index publication time is separate and must never be substituted for execution time. Original run IDs and export run IDs remain distinct.

Each observation also carries the cell's participating and allocated GPU counts, measurement wall seconds, clip duration and frame count, summed mean board watts, summed recorded enforced limits (null when no limit snapshot exists), the configured `tp_size` / `ulysses_degree` / `attention_backend` and the endpoint's replica count (`execution.deployment.replica_count`, null for bundles that predate it). The nullable `workloadKey` carries the full canonical workload identity when complete; prompts and seeds cannot be replaced by the shortened display label. These are additive, nullable fields under the same `schemaVersion: 1`; the hardware dashboard reads at most five pages and derives every displayed metric from them, so the browser never parses an artifact bundle for the chart.

The additive point contract also retains deployment/generation settings, hardware-health status, nullable per-dimension `quality`, original source ID/manifest SHA/source revision/artifact digest and independent fidelity/calibration/release labels. Old records with absent fields remain null. Quality scores require point-linked evaluator, rubric and calibration provenance; a history-level calibration label does not qualify its performance observations.

## Producer model identity

Serving imports accept `video-serving-<run>-<attempt>` alongside legacy H3 artifact names,
using the same immutable `h3-video-media/v1` namespace and checksum checks. The generic
serving matrix/evidence names are `video_serving_smoke_matrix`, `controlled_video_gpu` and
`live_video`; these evidence tags must match the Wan model. H3 retains its legacy tags; both accept `operator_endpoint` request records under a verified model-specific supervisor. Paired H3 result/fidelity contracts are unchanged. Wan request duration derives from `frame_count / fps`; H3 retains its explicit requested duration.
`manifest.workload_plan.model_id` preserves a failed producer's identity without `result.json`.
Wan's canonical ID is `Wan-AI/Wan2.2-T2V-A14B-Diffusers`; the old short ID is a selection alias.
A contradictory result identity is rejected; trusted history retains the manifest identity and
an explicit error, never an H3 fallback. Explicit planned counts require a sealed initial
`serving-smoke.json`; absent counts stay null. Video-only media may omit audio, while the
existing GPU verification, workload, media hash and sample requirements still govern charts.

## Source-bound observation metadata

A producer may add `dashboard-observations.json` with exactly
`{schemaVersion: 1, sourceRunId, sourceSha, cells}`. `sourceRunId` and `sourceSha`
must match the source manifest's `run_id` and `git_commit`. Its SHA256 must match
both the bundle checksum inventory and `manifest.evidence["dashboard-observations.json"]`;
`readVerifiedFiles` verifies the raw bytes during ingestion. Retained `StoredArtifact`
objects are the trusted transport of those already-verified documents and seals.

`cells` is a nonempty map keyed by existing serving cell IDs. Each cell records
`runSha256` and `specSha256`, matching that cell's sealed run/spec files, plus
optional nullable `deployment`, `hardwareHealth` and `quality`. The strict parser
rejects unknown fields, wrong types, invalid hashes and source/cell mismatches.
An invalid sidecar rejects that source's observation projection; an absent
sidecar preserves null additive fields. The nullable field shapes are documented
in the public video response schema; they do not alter metric units or turn
uncalibrated media similarity into quality qualification.

A local curator can enrich a development replay through the same field parser.
This remains an explicitly unsealed projection: it does not modify the sealed
source artifacts or acquire producer attestation by passing type validation.

## Evidence boundaries

- Only descriptive observations are shown: this version has no selected matched baseline and computes no before/after delta.
- Valid/completed/scheduled/failed counts stay separate. Missing or invalid metrics stay null. P90 retains the existing per-cell ten-sample display floor.
- Latency and throughput use the submission-to-downloaded-media window. Energy uses the recorded generation window and participating GPU boards. Board energy is not facility energy.
- Fidelity, calibration and release qualification are displayed independently. Stored/published does not mean qualified.
- Filters apply to loaded pages. The user can load older pages without losing already loaded entries. Global execution-time sorting and an editorial change/PR catalog require a later materialized catalog; the current implementation scans index metadata only, never all full indexes.

## Local replay

`E2E_FIXTURES=1` serves `cypress/fixtures/api/video-history.json` through the existing fixture loader and checksum manifest. The fixture is a metadata-only projection of retained H100/H200/B200 observations and two fidelity artifacts; it contains no infrastructure paths or video bytes. Unknown publication timestamps remain null. The response header `X-VideoGenX-Replay: 1` causes a visible replay notice. These are historical retained observations, not newly measured results or a new publication.

For a developer's retained-data preview, `VIDEOGENX_REPLAY_DIR` supplies a local `history.json` plus `<run>.<artifact>.json` metadata files through the same handlers only with `NODE_ENV=development`. This separate replay directory keeps private receipts and local paths outside the committed fixture and public catalog. It serves retained metadata, not new measurements or a production publication; unavailable media stays unavailable. The matching public view projection uses the same history and eligibility helpers.

## 中文说明

`/video` 与 `/zh/video` 首屏为跨硬件仪表板（见 [VideoGenX 仪表板](./videogenx-dashboard.md)）；本文描述的“性能历史”列表位于其下方可展开的区块，URL 带有 `history-*` 筛选参数（`history-hardware`、`history-concurrency`、`history-query`）时自动展开。每条记录链接到原始 GitHub Actions 运行。原有的按运行查看结果、trade-off 图表与 CI 运行浏览已随仪表板重建移除；视频对比由仪表板的 Compare 面板提供。

历史读取只列举既有发布索引的元数据，按索引发布时间排序，每页最多读取十份完整索引；不下载或发布媒体。原始执行时间取自 `ci.started_at`，与发布时间、重新导出的时间分开。索引无效时保留错误记录，缺失指标保留 null。每个 cell 另附参与/已分配 GPU 数、测量窗口秒数、视频时长与帧数、板卡平均功率之和、记录的生效功率上限之和（无快照时为 null）、配置的 `tp_size` / `ulysses_degree` / `attention_backend`，以及端点的副本数（`execution.deployment.replica_count`，早于该记录的产物包为 null）；`workloadKey` 在信息完整时保留完整工作负载身份，prompts 与 seeds 不能由缩写显示标签替代。这些都是同一 `schemaVersion: 1` 下可为空的附加字段，硬件仪表板最多读取五页，并据此推导全部指标，浏览器不再解析产物包。

当前展示观测值，未选择匹配基线，也不计算 before/after。延迟、吞吐量使用提交到下载完成的窗口；板卡能耗使用记录的生成窗口。保真度、阈值校准、发布验收单独展示。筛选仅作用于已加载的页面，可继续加载较早结果。

`E2E_FIXTURES=1` 使用保留结果的脱敏元数据回放，遵循现有 fixture 校验和清单，并显示回放提示。未知发布时间保持为空；这不是新测量或新发布。

附加字段还保留完整部署/生成配置、硬件健康、逐维度 `quality`、source ID、manifest SHA、source revision 与 artifact digest；旧记录缺少的字段仍为 null。历史层的校准标签不能代替逐点质量证据。质量未评价或未校准时不会进入质量前沿。

开发环境可通过 `VIDEOGENX_REPLAY_DIR` 读取本地 `history.json` 和 `<run>.<artifact>.json` 元数据；生产环境禁用该入口。保留数据目录与已提交的回归 fixture、公有结果目录相互独立，缺失媒体不会被标为已发布。

可选 `dashboard-observations.json` 使用 `schemaVersion: 1`，其 `sourceRunId`、
`sourceSha` 必须匹配原始 manifest，文件 SHA256 同时匹配 checksum 清单及
`manifest.evidence`。`cells` 按已有 serving cell ID 保存对应 run/spec 的 SHA256
和可为空的 deployment、hardwareHealth、quality。未知字段、类型错误或身份不符
会拒绝该 source 的观测投影；无 sidecar 时附加字段保持 null。开发回放的人工补充
也经过字段解析，但仍是明确未封存的投影，不会改写原产物或获得 producer attestation。

通用 serving 产物名称为 `video-serving-<run>-<attempt>`，沿用 `h3-video-media/v1`
及原有校验流程。`video_serving_smoke_matrix`、`controlled_video_gpu`、`live_video`
与旧 H3 类型兼容，但证据类型须与模型一致。两种模型均可在对应 supervisor 验证后使用 `operator_endpoint` 请求记录。配对结果和保真度契约保持不变。Wan 按 `frame_count / fps` 计算请求时长，H3 保留显式请求时长。即使没有 `result.json`，
`manifest.workload_plan.model_id` 也能保留失败来源的模型身份。Wan 的规范 ID 为
`Wan-AI/Wan2.2-T2V-A14B-Diffusers`，旧短 ID 仍可用于模型选择。结果中的模型与
manifest 冲突时会报错，不会归入 H3。计划计数须来自已封存的初始 `serving-smoke.json`，
未知值保持 null。纯视频产物可不含音频；进入图表仍须满足原有 GPU 执行、工作负载、
媒体哈希和样本数要求。
