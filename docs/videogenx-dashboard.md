# VideoGenX results (/video)

`VideoDashboard` renders the same shared results view at `/video` and `/zh/video`.
It preserves the existing feature gate, route registry, published History reader,
and sealed media loader. All visible copy lives in component-local `STRINGS`.

## Selection and evidence

Published Blob indexes → `GET /api/video-runs?format=history` → `videoPoints` →
`resultProjection`. Reads stop after five pages; the view API reports pagination
coverage. The browser never publishes a run or generates a clip. The read-only
`GET /api/v1/views/video?view=overview` returns the same selectors and calculations.
Legacy dashboard, compare, results, tradeoff and discovery API modes remain.

Comparisons require one complete canonical workload identity, C1, exactly 20
scheduled clips and at least ten valid samples on every hardware. Model revision,
all generation settings, prompts, seeds and measurement semantics remain in the
identity. The default selects the cohort covering the most target hardware.
Smoke, incomplete and unmatched evidence stays in Performance history. The four
comparison targets are GB200, B200, MI355X and H200; missing hardware remains
visible without invented results. These are comparison targets, not claims that
all models run on all hardware.

Latest observations are selected separately by workload, hardware, deployment
and engine. Engine identity comes from recorded configuration. Missing metadata
is not filled from a runtime SHA or hardware name. The GPU-count selector narrows
cards and tables; latency-versus-GPU-count and the deployment frontier retain the
other measured GPU counts for the same workload. Workload-mix rows preserve each
cohort separately rather than averaging across resolutions, durations or modes.

`r_*` URL parameters record filters, hidden hardware, deadline, cost tier, entered
mode prices and utilization. `r_workload` uses a compact source point identifier;
canonical workload JSON stays inside the projection. Share includes the `r_`
registry scope. `?unofficialrun=<id>` adds a separately identified published
observation in the overlay color, obeys hardware visibility and can be dismissed.
An unknown or unpublished run is explicitly unavailable; this URL cannot trigger
publication, storage writes or GPU work.

The Workload menu shows compact summaries derived from recorded model and generation
metadata. Its existing help control shows the full published label and exact source
point ID. Matching summaries get distinct source-ID suffixes. This is presentation
only; query IDs and API projection values remain unchanged.

The header keeps the five selectors in one shared control panel. Its help explains
the 20-clip cohort and fixture replay; the replay label appears only when active.
Hardware checkboxes sit above a full-width four-slot clip comparison. Item help
holds longer metric notes while chart encodings and modeled TCO remain visible.
Validity keeps the workload identity visible and discloses full hashes on request.
The uncalibrated rating schema is also disclosed on request.

## Nine groups and available measurements

| Group                    | Available when retained                                                                                   | Empty until evidence exists                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Validity                 | Workload/manifest hashes, sealed validation, completion counts, power validity                            | Exact paired PSNR/audio comparison without a sealed pair       |
| Latency                  | Serial/harness latency, client delivery P50/P90, P95 from >=20 aligned valid timings, deadline attainment | Missing client timestamps; text/denoise/VAE/encode stages      |
| Throughput               | Valid clips/wall second, generated video seconds/wall second, deadline goodput                            | Unsupported workload/mode distributions                        |
| Resources & Energy       | Valid participating-board power samples, mean/observed peak, J/clip, J/frame                              | Missing samples, GPU/host memory without their own measurement |
| Cost                     | Modelled TCO from registry rates and measured output; both GPU counts                                     | Missing allocation count or rate                               |
| Quality                  | Seven named human-rating dimensions, with no score polygon                                                | PSNR/SSIM, VBench/CLIP/VLM and calibrated human scores         |
| Stability                | Recorded failure categories, with unknown failures preserved                                              | Sustained-load behavior                                        |
| Startup                  | Recorded warmup request duration, explicitly separate from compile                                        | Load, isolated compile, first request and switch time          |
| Parallelism & Deployment | Per-hardware frontier of measured deployments                                                             | Best topology without the GPU-count sweep                      |

No illustrative measurement, video, coefficient, timestamp, phase band or
hardware-support matrix is shipped. Hatched areas are actual empty states.
A technical validity check does not imply quality acceptance or release
qualification. A median from a native harness is not relabeled client latency.
Power invalidation is propagated; power and energy stay null when it fails.
GPU-board energy excludes host, chassis and facility energy.

## Synchronized clips

`VideoResultsClips` reads `format=published` once per selected artifact. It validates
source identity and matches prompt, seed, repetition and recorded generation
configuration before showing clips together. Missing media does not erase numeric
evidence. The shared transport seeks and plays real video elements, stops at the
shared playable duration, and pauses when the selection or page visibility changes.

Difference displays an amplified absolute RGB difference at matched playback time
against a recorded H200 H3 50-step reference. It fails closed for absent references,
unequal frame geometry or blocked cross-origin pixel access. This preview is not a
sealed PSNR result. Distilled and full-step workloads are not silently equated.
Per-tile wall time is the selected request's duration; energy is the cell's mean
J/valid clip and is labeled accordingly.
The default tiles show hardware, recorded GPU count, media, wall time, unknown
PSNR, mean energy and both modeled TCO bases. Prompt, seed, take, run, artifact,
runtime and media source remain in the keyboard-accessible Prompt & sources
disclosure. The Difference label identifies the amplified browser preview; its
help carries the full qualification.

## Cost and profit

Both bases are always visible: participating boards and allocated boards. An
allocation must be evidenced; participating count is never substituted for it.
TCO per video = recorded GPU count × registry $/GPU-hour / measured clips/hour.
Cost per video-second divides by the recorded duration. Owning and rental tiers
reuse `hardware.ts` and the shared hardware registry. These are modelled costs,
not measurements or API bills.

The estimator begins with empty price inputs. Each T2V/I2V/R2V price is a user
scenario for the selected resolution and duration. Unknown mode yields no assumed
mode price. Revenue/hour = valid video-seconds/hour × utilization × entered price;
profit/hour subtracts the entire hourly GPU TCO for that basis. Both are normalized
by the corresponding GPU count for the plotted profit/GPU-hour. Utilization
reduces revenue, not the hours billed. This does not establish sustained capacity.

## Control coverage

| Control                                                                     | Read-only API coverage                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Model, workload, resolution, duration, mode, steps, GPU count, engine, date | `r_*` selection fields                                                                 |
| Hardware visibility, published unofficial run                               | `r_hidden`, `unofficialrun`, separate overlay cells                                    |
| Deadline, cost tier, mode prices, utilization                               | Same pure calculations in `resultProjection`                                           |
| Clip/frame energy                                                           | Both normalized values returned; toggle is presentation only                           |
| Power trace hardware                                                        | All selected cell traces returned; selector is presentation only                       |
| Clip transport, Difference, case navigation, History expand, theme, Share   | Presentation only; published media metadata uses the existing read-only media contract |
| Cohort/item help, prompt/source, hashes and rating disclosures, media link  | Presentation only; existing history and published media reads provide their data       |

Admin/publication handlers, private artifacts and credentials are excluded.
Video results controls and the new disclosures/media link record `video_results_*`
events. Shared `InfoHelp` retains its `selector_option_help_opened` event. Tests cover projection/API parity, both GPU bases,
nulls and invalid power, sample floors, overlay filtering, clip alignment, real
browser playback and difference failure, bilingual layout and 390px overflow.

## 中文说明

`/video` 与 `/zh/video` 共用结果页，沿用现有路由、功能开关、History 和封存媒体读取器。
比较要求固定的 20 条视频 C1 工作负载，每种硬件至少 10 个有效样本；完整身份包含模型版本、
生成参数、prompt、seed 和测量语义。较短 smoke、未完成及未匹配结果留在性能历史，不混入比较。
界面按有效性、延迟、吞吐量、资源与能耗、成本、质量、稳定性、启动、并行与部署的顺序展示。
待采集指标是真正的斜线空态，不使用示意数值。功率无效时不展示功率或能耗结论。
页首用一个共享控件区域展示五项筛选条件；硬件开关位于四栏视频对比上方。指标说明、
完整哈希及尚未校准的人工评分维度按需展开，图表图例与 TCO 估算口径仍直接可见。

四个视频窗口只读取已发布产物，核对 prompt、seed、重复次数和生成配置后同步播放。
Difference 是相对已记录 H200 H3 50-step 视频的浏览器 RGB 差异预览，不是封存的 PSNR 测量。
参考视频、尺寸或跨域读取条件不满足时显示不可用。蒸馏与完整步数分组保留。
默认视频卡片保留硬件、GPU 数量、媒体及两种 TCO 口径；完整 prompt、seed、重复次数、
运行、产物、Runtime 和媒体来源可在“Prompt 与来源”中查看。

成本同时按参与计算和分配的 GPU 数量估算，分配证据缺失时不填补。利润输入默认空白，属于用户
场景假设；利用率只降低收入，不减少付费时长。模式未知时不套用 T2V/I2V/R2V 价格。
只读 API 与页面共用选择和计算逻辑，`r_*` 参数可以分享，`?unofficialrun=` 单独标识已发布观测，
支持隐藏硬件及移除。读取不会启动 GPU、写入 Blob 或发布媒体。测试覆盖 API 一致性、样本门槛、
两种成本口径、缺失证据、同步视频与中英文 390px 布局。
