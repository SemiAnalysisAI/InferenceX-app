# VideoGenX dashboard (/video)

Why `/video` leads with a cross-hardware chart instead of a CI-run browser, and the rules its metrics obey. Component code lives in `packages/app/src/components/video-benchmark/` (`VideoDashboard.tsx` is the root).

## Data path

Published blob indexes → `GET /api/video-runs?format=history` (the per-cell projection described in [Video performance history](./video-history.md), with additive nullable fields for GPU counts, wall time, clip shape, board power, enforced limit and server layout) → `points.ts` (`videoPoints`, `latestVideoCells`) → `metrics.ts` (`metricValue`). The browser never parses an artifact bundle for the dashboard; media loads only inside the collapsed "Runs, videos & evidence" section, which mounts the previous `VideoCIRuns` views unchanged so `?run=`, `?view=`, `?compare=` and `history-*` deep links keep working and open that section automatically.

## Axes and defaults

`video-url-state.ts` owns the `v_*` URL params (`v_x`, `v_y`, `v_tier`, `v_basis`, `v_queue`, `v_opt`, `v_view`); defaults are omitted from the URL and every other param is left alone.

- **X = P90 time to video (s)**, lower is better. `p50Latency` and `genSpeed` (frames/s per request, the closest analogue to interactivity) are the alternatives.
- **Y = videos per $1 TCO** at the _Owning at Large Hyperscaler Volume_ tier. Cost per GPU-hour comes from `HW_REGISTRY` (`costh`/`costr`), the same SemiAnalysis TCO source `/inference` uses; the badge row and source link sit above the chart.
- **GPU basis**: _participating_ GPUs (the boards that generated the clip — 4 per video with TP2 × Ulysses 2) is chip efficiency; _allocated_ GPUs (H100/B200 reserved 8) is what a deployment bills. One toggle apart, never mixed in one number.
- **Why C1 by default**: the pinned H3 server is batch-one and single-replica, so client concurrency only queues requests — throughput stays flat while latency scales with C. C2/C4 render as dotted "queueing tails" behind the _Show queueing_ switch; they are evidence that batching does not help, not a frontier.
- **Pareto hull** (`frontier.ts`) flips lower-is-better axes and reuses `paretoFrontUpperLeft` from the calculator. With one C1 point per hardware the hull is a cross-hardware comparison; a per-hardware curve needs a GPUs-per-video sweep (design plan P6, GPU work not authorised yet). When one hardware dominates outright (today: B200), no hull path is drawn.

## Rules

- **Unavailable hardware** stays visible. `VIDEO_HARDWARE_ROSTER` in `hardware.ts` lists the campaign targets; MI355X has no valid run and renders as a muted legend row, a "Not measured" KPI card with the failed-run link, and no table row. A missing point is never a zero.
- **Nulls**: every formula returns `null` when an input is missing or invalid — power phase invalid, fewer than ten samples for P90, unknown hardware key, missing GPU count. `formatMetric` prints `—`.
- **Newest observation wins**: `latestVideoCells` keeps the first (newest publication) observation per hardware × concurrency, so a re-run replaces, never duplicates, a point.
- **Strings**: component-local `STRINGS = { en, zh }` via `useLocale()`; SKUs, units and identifiers stay English.
- **Fixture**: `cypress/fixtures/api/video-history.json` is rebuilt from retained `StoredArtifact` exports with `bun run fixtures:video-history <dir>` (`scripts/build-video-history-fixture.ts`); it is metadata only and registered in `_manifest.json`.

## 中文说明

`/video` 以跨硬件图表为首屏：数据来自已发布 blob 索引的 per-cell 投影，浏览器不再为图表解析产物包；原有的运行/视频/历史视图收进可展开的“运行、视频与证据”区块，`?run=`、`?view=`、`?compare=` 和 `history-*` 深链接会自动展开该区块。默认 X 为 P90 出片时间、Y 为每 1 美元 TCO 视频数（Hyperscaler 自有设备分档，单价与 `/inference` 同源）。默认只画 C1：pinned H3 服务是 batch-one、单副本，客户端并发只会排队，C2/C4 作为可选的点线尾迹展示。Pareto 包络复用 calculator 的前沿算法；参与/已分配 GPU 口径一键切换；MI355X 以“未测得”形式保留在图例与 KPI 卡中；缺失指标一律为 null，绝不写成 0。
