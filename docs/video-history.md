# Video performance history

`/video` and `/zh/video` lead with the cross-hardware dashboard (see [VideoGenX dashboard](./videogenx-dashboard.md)); the **Performance history** list described here sits in a collapsible section below it, which opens automatically when the URL carries a `history-*` filter (`history-hardware`, `history-concurrency`, `history-query`). Each entry links to its original GitHub Actions run. The earlier per-run viewer, trade-off chart and CI-run browser were removed with the dashboard rebuild; clips are compared in the dashboard's Compare panel.

## Read path

`GET /api/video-runs?format=history&page=1` returns a versioned UI projection of existing stored H3 indexes. It lists `h3-video-media/v1/runs/` metadata, validates pathname identities, sorts by index storage time (artifact ID breaks ties), then reads at most ten indexes for one page. It neither downloads media nor calls the publication path. A matching immutable receipt under `h3-video-media/v1/approvals/` marks an entry `approved: true`; missing or invalid receipts leave it in History with `approved: false`. The repository visibility check still applies. This UI transport is not a stable public benchmark API.

The projection groups all cells under the original source inside one artifact entry. It reuses `storedBundle`, `servingCells`, `storedFidelityBundle`, and the existing tradeoff calculations. Invalid or unavailable indexes remain explicit error entries. Original execution time comes from `ci.started_at`; index publication time is separate and must never be substituted for execution time. Original run IDs and export run IDs remain distinct.

Two launchers produce the serving matrix, and `serving.ts` keys the contract on the manifest's `evidence_kind`. The legacy controlled GPU supervisor (`controlled_h3_gpu`) wrote `controlled_serving_smoke` receipts, device inventories, power-limit snapshots and fully timed request records. The native srt-slurm launcher (`srt_slurm_h3_service`, InferenceX #2916) writes `srt_slurm_h3_service_receipt` receipts that seal a `h3_native_power` document (`power.valid`, the receipt's `power.sha256` and the measurement phase must agree), per-cell InferenceX sidecars (`aggregate.json`, `benchmark_concurrency_<N>.json`; a `power_valid` of 0 or an `energy_normalization` other than `clips` withholds the number), and a matrix-level `power_verified` verdict shown on the source line. Native bundles name no GPU model: the projection reads `ci.site.gpu_model` when present, else the registry SKU in `ci.ci.runner_name`, else leaves the hardware empty. When an srt-client run record carries no per-request latency, the harness summary (`latency_median_seconds`, `valid_clips_per_second`, cross-checked against the matrix cell) stands in for P50 and throughput; P90 still needs the per-request population. Power that is not `valid` renders as not measured, never as a number.

Allocated GPU counts require retained Slurm `AllocTRES` or the validated AMD allocation binding; a native power document's `expected_gpu_count` describes telemetry coverage and cannot establish the reservation. Without allocation evidence, the count and allocation-normalized metrics remain null.

Each observation also carries the cell's participating and allocated GPU counts, measurement wall seconds, clip duration and frame count, summed mean board watts, summed recorded enforced limits (null when no limit snapshot exists), the configured `tp_size` / `ulysses_degree` / `attention_backend` and the endpoint's replica count (`execution.deployment.replica_count`, null for bundles that predate it). The nullable `workloadKey` carries the full canonical workload identity when complete; prompts and seeds cannot be replaced by the shortened display label. These are additive, nullable fields under the same `schemaVersion: 1`; the hardware dashboard reads at most five pages and derives every displayed metric from them, so the browser never parses an artifact bundle for the chart.

## Publication and discovery

The `publish-video-results` repository dispatch supplies an explicit `source_run_id` and `merge_run_id`; manual `workflow_dispatch` requires a source `run_id`. There is no scheduled all-runs publisher. The job lists only that run's GitHub artifacts (including later artifact pages), then sends each exact run/artifact ID to bearer-protected `POST /api/video-runs` using the existing invalidation secret. It retries already stored indexes because they may lack an approval receipt. Failed artifacts do not prevent later artifacts from being attempted, but the job still fails. Authorization approves publication of the named source; it is not a benchmark qualification verdict.

Native matrix artifacts use `h3-results-<run>-<attempt>-<recipe-fingerprint>` while legacy names remain readable. The sealed `artifact_name`, run/attempt, and `ci.head_sha` bind a new artifact to GitHub metadata. The actual benchmark checkout remains `git_commit`, which may differ from the Actions head when CI tests a merge commit. The authorized POST writes verified immutable objects before the index, checks index readback, then writes a separate immutable approval receipt bound to artifact identity, source seal and checkout. A repeat with the same identity reuses the receipt; a mismatched receipt does not authorize the source. Every public GET, including `format=media` on a cache miss, is read-only and returns 204 when stored media is absent. Legacy stored indexes and low-sample or failed sources remain in History, while only approval-backed observations enter default chart selectors; sample floors still apply.

## Evidence boundaries

- Only descriptive observations are shown: this version has no selected matched baseline and computes no before/after delta.
- Valid/completed/scheduled/failed counts stay separate. Missing or invalid metrics stay null. P90 retains the existing per-cell ten-sample display floor.
- Latency and throughput use the submission-to-downloaded-media window. Energy uses the recorded generation window and participating GPU boards. Board energy is not facility energy.
- Fidelity, calibration and release qualification are displayed independently. Stored/published does not mean qualified.
- Filters apply to loaded pages. The user can load older pages without losing already loaded entries. Global execution-time sorting and an editorial change/PR catalog require a later materialized catalog; the current implementation scans index metadata only, never all full indexes.

## Local replay

Only in development, `E2E_FIXTURES=1` serves `cypress/fixtures/api/video-history.json` through the existing fixture loader and checksum manifest. The fixture is a metadata-only projection of retained H100/H200/B200 observations and two fidelity artifacts; it contains no infrastructure paths or video bytes. Its synthetic `approved: true` flags exercise the default chart layout and are not real publication receipts. Unknown publication timestamps remain null. The response header `X-VideoGenX-Replay: 1` causes a visible replay notice. These are historical retained observations, not newly measured results or a new publication.

For a local browser replay of original artifacts, set `E2E_FIXTURES=1` and
`E2E_VIDEO_REPLAY_MANIFEST=/absolute/replay-input.json` on the development server.
The JSON manifest contains absolute `zipPath` and `metadataPath` fields, plus
`expectedPlanSha256`, or an `artifacts` array of objects with those same fields.
The server independently verifies each original ZIP against its metadata and
plan hash, replaces History with their unapproved entries, and serves each exact
run/artifact pair and its MP4 byte ranges through `/api/video-runs`. Empty arrays,
duplicate run/artifact pairs, or any invalid member reject the entire collection.
The original ZIPs are read-only. Unknown identities and paths cannot use the production fallback while
this adapter is active. `format=replay-asset` is unavailable outside the gate.
This mode preserves the original `releaseQualified=false` verdict and never
creates an approval receipt. The ordinary fixture remains the default when no
explicit manifest is set. Restart the development server after changing the
manifest. The existing `unofficialrun` selector accepts one run ID; artifacts
from that run compare only when their canonical workloads match.

### Original CI ZIP reader check

The replay manifest may also contain
`quality: { path: "/absolute/quality.json", sha256: "<digest>" }`. This independent
v1 attachment names the scorer revision/hash and original reference receipts, then
binds each comparison to the candidate run/artifact/source/manifest/cell/slot/case/
prompt/seed/media SHA. Each reference descriptor contains `receipt_path`,
`receipt_sha256` and the adjacent SHA256SUMS file's `checksums_sha256`. The reader
verifies receipt and referenced MP4 bytes before exposing scores or reference URLs.
Private paths and free-text decoder errors never enter the JSON response; public
checks contain allowlisted names/status and only numeric or boolean observations.
Raw diagnostics remain in the sealed local attachment.

Original ZIPs stay unchanged. Duplicate pairs, substituted identities, unsafe paths
or invalid seals fail the attachment closed. Reference MP4s use the existing replay
byte-range path with a receipt-scoped source identity and exact candidate
run/artifact membership; unbound cases are unavailable. This route remains
development-only. PSNR comes from complete decoded RGB24 comparison, not the browser
difference canvas. Exact equality and incompatible media have distinct statuses
with null PSNR. Original plan hashes, unjudged quality and releaseQualified=false
remain visible.

中文：回放配置可额外提供 `quality: { path, sha256 }`，读取独立封存的 v1 配对附件。读取前校验原始参考回执、相邻 SHA256SUMS 及所引用 MP4 字节，并精确绑定候选运行、产物、来源、manifest、测量单元、slot、用例、prompt、seed 和媒体 SHA。本机路径和解码器自由文本错误不进入 API；公开检查仅保留允许的名称、状态及数值或布尔观察值，完整诊断留在本地封存附件。重复配对、身份替换、不安全路径或封印失效均拒绝读取。参考视频按参考回执和候选 run/artifact 隔离，只提供该产物实际绑定的用例，不授予发布批准，也不修改原始 ZIP。

From `packages/app`, replay an unmodified native H3 CI ZIP with its original GitHub
artifact-object JSON and the expected sealed plan SHA256:

```sh
bun --no-env-file scripts/replay-video-artifact.ts original.zip github-artifact.json EXPECTED_PLAN_SHA256
```

The command reads local files only and disables `fetch`. It requires the original
archive size, SHA256 digest, artifact ID/name and workflow run/head identity, then
uses the same archive, bundle, serving, History and Results readers as the app.
It prints JSON containing each cell's plan hash, frame/case/distinct-prompt counts,
completion and power verdicts, both GPU counts, source errors and Results diagnostics
for every qualifying workload. Source errors, missing cells and mismatched expected
plan hashes produce a nonzero exit. Recorded benchmark failures remain in the report.

Local replay has no approval receipt: `approved` is false, `publishedAt` is null and
`officialPoints` is zero. Named diagnostics still obey the Results sample and workload
requirements. The command neither publishes metadata nor creates media URLs, and it
does not modify fixtures. Reader acceptance of an older plan does not qualify a new
workload or establish browser/API/playback, CI E2E, or release acceptance.

## 中文说明

从 `packages/app` 使用上述 `bun --no-env-file` 命令，可离线读取未改动的原始 CI ZIP、
GitHub 产物元数据和预期 plan SHA256。读取器校验原始字节摘要与执行身份，逐 cell 输出
实际工作负载、完成/失败计数、功率结论和参与/已分配 GPU 数；来源错误、空 cells 或 plan
哈希不符时以非零状态退出。此操作不写存储、不更新 fixture、不生成媒体地址，也不授予
发布批准；`officialPoints` 应为 0。旧工作负载读取成功不能代替新 workload 的 CI E2E、
页面/API/播放或发布验收。

`publish-video-results` repository dispatch 明确传入 `source_run_id` 与 `merge_run_id`；手动 `workflow_dispatch` 必须指定来源 `run_id`，不再定时扫描全部运行。任务只列举指定运行的 GitHub 产物及其后续分页，对每个产物以现有失效密钥调用受 Bearer 保护的 `POST /api/video-runs`。已存索引仍会重试，以补写可能缺失的批准回执；某个产物失败后继续尝试后续产物，但任务最终报告失败。此授权只批准指定来源的发布，不代表 benchmark 通过质量验收。

原生矩阵采用 `h3-results-<run>-<attempt>-<recipe-fingerprint>`，旧名称仍可读取。封存的 `artifact_name`、run/attempt 和 `ci.head_sha` 对应 GitHub 元数据；实际 benchmark checkout 仍单独记录为 `git_commit`，测试 merge commit 时它可以不同于 Actions head。授权 POST 先写已校验的不可变对象与索引，并确认索引可读，再写绑定产物身份、来源哈希和 checkout 的独立不可变批准回执。所有公开 GET（包括 `format=media` 未命中）都不写入；缺少媒体时返回 204。旧索引、失败或低样本来源仍在历史中；只有回执验证通过的观测进入默认图表，原有样本门槛继续适用。

`/video` 与 `/zh/video` 首屏为跨硬件仪表板（见 [VideoGenX 仪表板](./videogenx-dashboard.md)）；本文描述的“性能历史”列表位于其下方可展开的区块，URL 带有 `history-*` 筛选参数（`history-hardware`、`history-concurrency`、`history-query`）时自动展开。每条记录链接到原始 GitHub Actions 运行。原有的按运行查看结果、trade-off 图表与 CI 运行浏览已随仪表板重建移除；视频对比由仪表板的 Compare 面板提供。

历史读取只列举既有发布索引的元数据，按索引发布时间排序，每页最多读取十份完整索引；不下载或发布媒体。原始执行时间取自 `ci.started_at`，与发布时间、重新导出的时间分开。索引无效时保留错误记录，缺失指标保留 null。已分配 GPU 数须有保留的 Slurm `AllocTRES` 或通过验证的 AMD allocation binding；原生功率文档的 `expected_gpu_count` 仅描述遥测覆盖范围，不能证明预留数量。缺少分配证据时，该数量及按分配数量归一化的指标保持 null。每个 cell 另附参与/已分配 GPU 数、测量窗口秒数、视频时长与帧数、板卡平均功率之和、记录的生效功率上限之和（无快照时为 null）、配置的 `tp_size` / `ulysses_degree` / `attention_backend`，以及端点的副本数（`execution.deployment.replica_count`，早于该记录的产物包为 null）；`workloadKey` 在信息完整时保留完整工作负载身份，prompts 与 seeds 不能由缩写显示标签替代。这些都是同一 `schemaVersion: 1` 下可为空的附加字段，硬件仪表板最多读取五页，并据此推导全部指标，浏览器不再解析产物包。

serving 矩阵有两种来源，`serving.ts` 按 manifest 的 `evidence_kind` 区分契约：旧的受控 GPU supervisor（`controlled_h3_gpu`）写入 `controlled_serving_smoke` 回执、设备清单、功率上限快照和带完整计时的请求记录；原生 srt-slurm launcher（`srt_slurm_h3_service`，InferenceX #2916）写入 `srt_slurm_h3_service_receipt` 回执，并对 `h3_native_power` 功率文档做封印（`power.valid`、回执中的 `power.sha256` 与测量阶段必须一致），同时附带每个 cell 的 InferenceX sidecar（`aggregate.json`、`benchmark_concurrency_<N>.json`；`power_valid` 为 0 或 `energy_normalization` 不是 `clips` 时不显示对应数值），矩阵级的 `power_verified` 结论显示在来源行。原生产物包不记录 GPU 型号：投影优先读取 `ci.site.gpu_model`，其次从 `ci.ci.runner_name` 中识别注册表 SKU，都没有时硬件留空。srt-client 的运行记录没有逐请求延迟时，以 harness 汇总（`latency_median_seconds`、`valid_clips_per_second`，并与矩阵 cell 交叉核对）代替 P50 与吞吐量；P90 仍需要逐请求样本。功率未通过 `valid` 校验时一律显示为未测得，不显示数字。

当前展示观测值，未选择匹配基线，也不计算 before/after。延迟、吞吐量使用提交到下载完成的窗口；板卡能耗使用记录的生成窗口。保真度、阈值校准、发布验收单独展示。筛选仅作用于已加载的页面，可继续加载较早结果。

仅在开发环境中，`E2E_FIXTURES=1` 使用保留结果的脱敏元数据回放，遵循现有 fixture 校验和清单，并显示回放提示。fixture 中合成的 `approved: true` 仅验证图表布局，不是实际批准回执。未知发布时间保持为空；这不是新测量或新发布。

原始产物的本地浏览器回放需在开发服务器设置 `E2E_FIXTURES=1` 和指向绝对路径的
`E2E_VIDEO_REPLAY_MANIFEST`。该 JSON 文件填写原始 ZIP、GitHub 元数据的绝对路径
`zipPath`、`metadataPath` 及 `expectedPlanSha256`；也可用 `artifacts` 数组列出多组相同字段。
服务器逐一核对每份原始 ZIP 的元数据和 plan hash，以各自的未批准记录替换 History，
并按准确的 run/artifact 身份通过现有 `/api/video-runs` 读取原始 MP4 字节。
数组为空、run/artifact 身份重复或任一成员校验失败时，整组回放均不可用。输入 ZIP 不会被修改；
未知身份或路径不会回退到线上读取，`format=replay-asset` 在此模式外返回 404。
原有 `releaseQualified=false` 结论保持不变，也不会生成批准回执；不配置显式 manifest 时仍使用普通 fixture。
修改 manifest 后需重启开发服务器。现有 `unofficialrun` 筛选仅接受一个 run ID；该运行内的产物
只有在完整工作负载身份一致时才会并排比较。
