# Video performance history

`/video` and `/zh/video` default to **Performance history**. Explicit run/artifact/source/cell URLs retain the existing video viewer. `?view=results` opens the first readable artifact/source from the newest published page; `?view=history` restores history. History filters use `history-hardware`, `history-concurrency`, and `history-query` in the URL. Videos & result follows the same published-first path when no run is selected; empty or failed reads show a recoverable message. Browse CI runs explicitly opens legacy Actions discovery. Returning to History cancels pending result selection; Refresh and reload preserve the selected artifact/source/cell.

## Read path

`GET /api/video-runs?format=history&page=1` returns a versioned UI projection of existing published H3 indexes. It lists `h3-video-media/v1/runs/` metadata, validates pathname identities, sorts by index publication time (artifact ID breaks ties), then reads at most ten indexes for one page. It neither downloads media nor calls the publication path. The repository visibility check still applies. This UI transport is not a stable public benchmark API.

The projection groups all cells under the original source inside one artifact entry. It reuses `storedBundle`, `servingCells`, `storedFidelityBundle`, and the existing tradeoff calculations. Invalid or unavailable indexes remain explicit error entries. Original execution time comes from `ci.started_at`; index publication time is separate and must never be substituted for execution time. Original run IDs and export run IDs remain distinct.

## Evidence boundaries

- Only descriptive observations are shown: this version has no selected matched baseline and computes no before/after delta.
- Valid/completed/scheduled/failed counts stay separate. Missing or invalid metrics stay null. P90 retains the existing per-cell ten-sample display floor.
- Latency and throughput use the submission-to-downloaded-media window. Energy uses the recorded generation window and participating GPU boards. Board energy is not facility energy.
- Fidelity, calibration and release qualification are displayed independently. Stored/published does not mean qualified.
- Filters apply to loaded pages. The user can load older pages without losing already loaded entries. Global execution-time sorting and an editorial change/PR catalog require a later materialized catalog; the current implementation scans index metadata only, never all full indexes.

## Local replay

`E2E_FIXTURES=1` serves `cypress/fixtures/api/video-history.json` through the existing fixture loader and checksum manifest. The fixture is a metadata-only projection of retained H100/H200/B200 observations and two fidelity artifacts; it contains no infrastructure paths or video bytes. Unknown publication timestamps remain null. The response header `X-VideoGenX-Replay: 1` causes a visible replay notice. These are historical retained observations, not newly measured results or a new publication.

## 中文说明

`/video` 与 `/zh/video` 默认打开“性能历史”。原有 run/artifact/source/cell 链接仍打开对应结果；`?view=results` 打开最新发布页面中首个可读取的产物与原始运行；未选择运行时，“视频与结果”也使用该入口。空列表或读取失败会显示可恢复的提示；只有点击“浏览 CI 运行”才扫描 GitHub Actions。返回性能历史会取消正在进行的结果选择；刷新和重新加载保留产物、原始运行及并发配置。历史筛选条件保存在 URL，刷新后恢复。

历史读取只列举既有发布索引的元数据，按索引发布时间排序，每页最多读取十份完整索引；不下载或发布媒体。原始执行时间取自 `ci.started_at`，与发布时间、重新导出的时间分开。索引无效时保留错误记录，缺失指标保留 null。

当前展示观测值，未选择匹配基线，也不计算 before/after。延迟、吞吐量使用提交到下载完成的窗口；板卡能耗使用记录的生成窗口。保真度、阈值校准、发布验收单独展示。筛选仅作用于已加载的页面，可继续加载较早结果。

`E2E_FIXTURES=1` 使用保留结果的脱敏元数据回放，遵循现有 fixture 校验和清单，并显示回放提示。未知发布时间保持为空；这不是新测量或新发布。
