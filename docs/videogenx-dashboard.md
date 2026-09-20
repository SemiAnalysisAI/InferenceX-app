# VideoGenX dashboard (/video)

Why `/video` leads with a cross-hardware chart instead of a CI-run browser, and the rules its metrics obey. Component code lives in `packages/app/src/components/video-benchmark/` (`VideoDashboard.tsx` is the root).

## Data path

Published blob indexes → `GET /api/video-runs?format=history` (the per-cell projection described in [Video performance history](./video-history.md), with additive nullable fields for GPU counts, wall time, clip shape, board power, enforced limit and server layout) → `points.ts` (`videoPoints`, `latestVideoCells`) → `metrics.ts` (`metricValue`). The browser never parses an artifact bundle for the dashboard; media loads only inside the collapsed "Runs, videos & evidence" section, which mounts the previous `VideoCIRuns` views unchanged so `?run=`, `?view=`, `?compare=` and `history-*` deep links keep working and open that section automatically.

## Axes and defaults

`video-url-state.ts` owns the `v_*` URL params (`v_x`, `v_y`, `v_tier`, `v_basis`, `v_queue`, `v_opt`, `v_frontier`, `v_view`); defaults are omitted from the URL and every other param is left alone.

- **X = P90 time to video (s)**, lower is better. `p50Latency` and `genSpeed` (frames/s per request, the closest analogue to interactivity) are the alternatives.
- **Y = videos per $1 TCO** at the _Owning at Large Hyperscaler Volume_ tier. Cost per GPU-hour comes from `HW_REGISTRY` (`costh`/`costr`), the same SemiAnalysis TCO source `/inference` uses; the badge row and source link sit above the chart.
- **GPU basis**: _participating_ GPUs (the boards that generated the clip — 4 per video with TP2 × Ulysses 2) is chip efficiency; _allocated_ GPUs (H100/B200 reserved 8) is what a deployment bills. One toggle apart, never mixed in one number.

## Deployments, not concurrency, make the curve

`/inference` sweeps batch size to trace each hardware's latency-vs-throughput frontier. A diffusion video server has no batching lever: the pinned H3 SGLang server is batch-one and single-replica, so client concurrency only queues requests — the retained C1/C2/C4 cells show throughput flat within ±1.5 % while latency scales with C. Joining those cells would draw a flat "curve" that measures the queue, not the hardware, so the chart never does.

The knob that does trade latency for efficiency is the **deployment**: how many GPU boards serve one request and how they split the model (`tp_size` × `ulysses_degree`). `deployment.ts` keys cells by it (`deploymentKey`), classifies `concurrency > replicas` as queueing (`isQueueing`; bundles that predate `execution.deployment.replica_count` ran one endpoint, so null reads as one), and picks each hardware's most efficient deployment as its representative (`leadCell`, used by the KPI cards and the legend).

`plot.ts` (`plotVideoPoints`) then builds the chart: per hardware, the Pareto frontier over its deployment cells (`frontier.ts` flips lower-is-better axes and reuses `paretoFrontUpperLeft` from the calculator); a solid line appears once a hardware has two or more frontier deployments, dominated deployments render faded, and _Optimal only_ hides them. Queued cells are opt-in (_Show queued requests_), drawn as small faded markers and never joined. _Pareto frontier_ adds the dashed cross-hardware frontier over all deployments, as on `/inference`; when one hardware dominates outright (today: B200) the caption says so instead of drawing a line.

Today every hardware has exactly one measured deployment (4 GPUs per video, TP2 × Ulysses 2), so the chart is an honest scatter and the caption says a per-hardware curve needs the GPUs-per-video sweep. That sweep (design plan P6) is backend work in InferenceX `experimental/video-generation` — the serving matrix currently varies only concurrency — and needs GPU authorisation; the frontend needs no change when its cells arrive, because they differ in `deploymentKey` and therefore add points rather than replace them.

## Sections below the chart

- **API price reference** (`api-reference.ts`, `VideoApiReference.tsx`): a dated, editable USD per video-second list price (`v_api`, default `H3_API_REFERENCE`) feeds the API-priced metrics in `metrics.ts` — API $/video, revenue and profit per GPU-hour, API price ÷ TCO multiple. It is a web-search reference, labelled with its capture date and range, never presented as an official quote; a null or non-positive price nulls every derived metric. The chart's y axis is zero-anchored (`chart-domain.ts`) so negative profit stays visible and an all-negative view tops out at break-even.
- **Compare** (`compare.ts`, `compare-url-state.ts`, `VideoCompare.tsx`): arena-style baseline vs. candidate, video first — the same prompt + seed clips from both CI runs play side by side with shared play/pause/restart, case arrows, and a blind mode that hides which hardware is which until revealed; the metric deltas (registry polarity) sit below. One selectable cell per hardware (its lead deployment); `v_base`, `v_cand`, `v_case` in the URL. The two stored artifacts (several MB each) load once the panel scrolls into view; an HTTP 204 side reads as "clips not published", never as an error.
- **Compute-bound evidence** (`evidence.ts`, `VideoEvidence.tsx`): board power against the recorded enforced limit, the concurrency plateau (throughput flat, latency × C), and observed speed-ups against memory-bandwidth and FLOPS spec ratios. Every hardware is read on the deployment layout most of them share (`sharedLayoutCells`) so the exhibits compare like with like; sentences stay conditional when ratios do not separate.

## Rules

- **Unavailable hardware** stays visible. `VIDEO_HARDWARE_ROSTER` in `hardware.ts` lists the campaign targets; MI355X has no valid run and renders as a muted legend row, a "Not measured" KPI card with the failed-run link, and no table row. A missing point is never a zero.
- **Nulls**: every formula returns `null` when an input is missing or invalid — power phase invalid, fewer than ten samples for P90, unknown hardware key, missing GPU count. `formatMetric` prints `—`.
- **Newest observation wins**: `latestVideoCells` keeps the first (newest publication) observation per hardware × concurrency, so a re-run replaces, never duplicates, a point.
- **Strings**: component-local `STRINGS = { en, zh }` via `useLocale()`; SKUs, units and identifiers stay English.
- **Fixture**: `cypress/fixtures/api/video-history.json` is rebuilt from retained `StoredArtifact` exports with `bun run fixtures:video-history <dir>` (`scripts/build-video-history-fixture.ts`); it is metadata only and registered in `_manifest.json`.

## 中文说明

`/video` 以跨硬件图表为首屏：数据来自已发布 blob 索引的 per-cell 投影，浏览器不再为图表解析产物包；原有的运行/视频/历史视图收进可展开的“运行、视频与证据”区块，`?run=`、`?view=`、`?compare=` 和 `history-*` 深链接会自动展开该区块。默认 X 为 P90 出片时间、Y 为每 1 美元 TCO 视频数（Hyperscaler 自有设备档位，单价与 `/inference` 同源）。

曲线来自部署而不是并发：pinned H3 服务是 batch-one、单副本，客户端并发只会排队（保留数据中 C1/C2/C4 的吞吐量相差不到 1.5%，延迟随 C 线性增长），把这些点连起来画出的只是队列，因此图表绝不连接它们。真正在延迟与效率之间取舍的是部署方式：每条视频占用多少张 GPU 以及模型如何切分（`tp_size` × `ulysses_degree`）。`deployment.ts` 以此为 cell 键，把 `concurrency > replicas` 判定为排队，并为每种硬件选出最高效的部署作为代表；`plot.ts` 按硬件对部署点求 Pareto 前沿，达到两个及以上前沿点时才画实线，被支配的部署以淡色显示，“仅最优”可将其隐藏；排队点需手动开启，只画小号淡色标记、不连线；“Pareto 前沿”开关叠加跨硬件虚线。目前每种硬件只有一种实测部署（每条视频 4 张 GPU，TP2 × Ulysses 2），所以图表是诚实的散点图，说明文字会指出每硬件曲线还需扫描每条视频占用的 GPU 数；该扫描属于 InferenceX 后端工作并需要 GPU 授权，前端无需改动即可接收新 cell。参与/已分配 GPU 口径一键切换；MI355X 以“未测得”形式保留在图例与 KPI 卡中；缺失指标一律为 null，绝不写成 0。

图表下方还有三个区块：带日期、可编辑的 API 参考价（`v_api`，来自网页搜索，标注采集日期与区间，不是官方报价）驱动 API 标价 / 条视频、每 GPU 小时收入与利润、API 标价 ÷ TCO 倍数等指标，价格无效时全部为 null，y 轴锚定 0 以便显示负利润；arena 式 Compare 以视频为主：同一 prompt 与 seed 在两种硬件上的视频并排播放，支持同步播放/暂停/重播、用例翻页和“盲测模式”（揭晓前隐藏硬件），指标差值列在视频下方，面板滚入视口时才加载两个已发布产物；compute-bound 证据面板展示板卡功率相对生效上限、并发排队平台以及相对带宽/FLOPS 规格比的实测加速比，所有硬件都读取它们共有的部署布局，比值无法区分时措辞保持保守。
