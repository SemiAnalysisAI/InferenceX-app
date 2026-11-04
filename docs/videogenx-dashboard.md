# VideoGenX results (/video)

`VideoDashboard` renders the same shared results view at `/video` and `/zh/video`.
It preserves the existing feature gate, route registry, published History reader,
and sealed media loader. All visible copy lives in component-local `STRINGS`.

## Selection and evidence

Stored Blob indexes and matching publication approvals →
`GET /api/video-runs?format=history` → `videoPoints` →
`resultProjection`. Reads stop after five pages; the view API reports pagination
coverage. History retains unapproved stored sources; `videoPoints` admits only
entries with an approval receipt matching their original source and checkout.
Approval is separate from full-sweep or release qualification. The browser never
publishes a run or generates a clip. The read-only
`GET /api/v1/views/video?view=overview` returns the same selectors and calculations.
Legacy dashboard, compare, results, tradeoff and discovery API modes remain.

Comparisons require one complete canonical workload identity, C1, exactly 20
scheduled clips and at least ten valid samples on every hardware. Model revision,
all generation settings, prompts, seeds and measurement semantics remain in the
identity. The default selects the cohort covering the most target hardware.
Smoke, incomplete and unmatched evidence stays in Performance history. The four
default comparison targets are GB200, B200, MI355X and H200; missing hardware remains
visible without invented results. H100 joins the roster when qualified approved
evidence or the exact named diagnostic run is available, with the same workload
and sample requirements. Its label and costs use the hardware registry. These are
comparison targets, not claims that all models run on all hardware.

Latest observations are selected separately by workload, hardware, deployment
and engine. Engine identity comes from recorded configuration. Missing metadata
is not filled from a runtime SHA or hardware name. The GPU-count selector narrows
the results table and clips; the chart and deployment detail retain every measured
GPU count for the same workload. Workload-mix rows preserve each
cohort separately rather than averaging across resolutions, durations or modes.

`r_*` URL parameters record filters, hidden hardware, chart axes (`r_x`, `r_y`),
cost basis (`r_basis`), Optimal Only (`r_optimal`), the open deployment
(`r_point`), deadline, cost tier, entered mode prices and utilization. `r_workload` uses a compact source point identifier;
canonical workload JSON stays inside the projection. Share includes the `r_`
registry scope. `?unofficialrun=<id>` reads only that stored run through
`namedRunPoints`, retaining its actual approval status. While selected, that run
appears only in `overlayCells` and `overlayDeploymentCells`, even if approved; it
leaves official cells, deployment cells and workload mix. `overlayCells` uses the
selected GPU count for the table and clips; `overlayDeploymentCells` retains all
matching GPU counts for the chart and deployment detail. Clearing the selection cannot promote an
unapproved source. Dismissal clears a workload selection absent from the approved
choices and preserves valid approved selections. All comparison filters and sample requirements still apply.
Unknown or unstored runs remain unavailable; the URL cannot trigger publication,
storage writes or GPU work.

Approved evidence determines the preferred cohort. A workload available only in
the named run requires explicit selection, or becomes the fallback when no approved
cohort matches. The browser retains one bounded History read and rederives both
lists when the URL changes. Legacy dashboard/compare APIs remain approved-only.
The overview API returns JSON by default. `format=csv` downloads the same selected official and named cells with exact source/workload/run/artifact identities, approval state, units and both GPU cost bases. `duration_s` retains the requested plan duration; `video_seconds_per_s` reports validated decoded output seconds per wall second. Missing values remain empty cells; CSV is private and no-store.

The Workload menu shows compact summaries derived from recorded model and generation
metadata. Its existing help control shows the full source label, exact source
point ID. Matching summaries get distinct source-ID suffixes. This is presentation
only; query IDs and API projection values remain unchanged.

## Layout

The page follows the inference and AgentX two-level layout. The overview has four parts:

1. The header card holds the cohort help, Share and four control panels: Benchmark
   config (model, workload, engine), Chart config (X and Y metric), Deployment (GPU
   count) and Run context (run date). The replay label appears only when fixture
   replay is active.
2. The chart card plots every measured deployment of the selected workload. X is
   P50 (default) or P90 latency per clip. Y is video-seconds per $1 TCO (default),
   videos per GPU-hour or GPU kJ per valid clip. `results-chart.ts` registers each
   metric with its label, unit and better direction. Each hardware and each overlay
   run is one series with its own Pareto frontier; Optimal Only hides dominated
   deployments. The sidebar legend toggles hardware, greys out roster hardware
   without a matched run, and holds the deployment-label switch and the GPU basis
   and cost tier selects. Clicking a point pins a popover with its measurements;
   its View telemetry button opens the deployment detail. The Representative
   deployments table below has one row per hardware and unofficial run, showing the
   deployment with the most videos per participating GPU-hour. It scrolls
   horizontally on narrow screens, and a row opens the same detail.
3. The clip comparison described in Synchronized clips.
4. Collapsed details: How to read these results, the profit estimator and
   Performance history. How to read lists the measurements not yet collected. No
   placeholder chart, illustrative value or uncalibrated rating schema is shipped.

`r_point` opens one deployment detail. Opening pushes a history entry marked in
`history.state` through the `client-navigation` helpers, so the in-page Back button
pops that entry even after reload or Forward. Browser Back also returns to the
overview at its previous scroll position. The overview stays mounted but hidden
under React `Activity`, so clip media, the selected clip group, loaded History pages
and chart state survive the visit. An unknown, filtered or hidden `r_point` falls
back to the overview. Once results load, the URL drops that key, so showing the
hardware again or Share cannot reopen it. Overlay deployments open the same way.

The detail header names hardware, model, engine, run date and any overlay run ID.
Chips switch between the measured deployments of that hardware; dashed chips mark
GPU counts without a measurement. A spec grid lists GPUs, concurrency, engine,
runtime, workload, valid clips, power evidence and the hourly GPU rate. Three tabs
hold the evidence:

| Tab       | Contents                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telemetry | Per-clip latency distribution, recorded P50/P90/P95, deadline attainment, GPU board power trace, energy per clip and frame, throughput, both cost bases, warmup and failure categories, GPU memory when recorded |
| Validity  | Workload and manifest hashes, sealed validation, completion counts, power validity and the link to per-clip PSNR                                                                                                 |
| Sources   | Model, workload, runtime, run, artifact, observation and approval identities                                                                                                                                     |

P95 requires at least 20 aligned valid timings. A technical validity check does not
imply quality acceptance or release qualification. A median from a native harness is
not relabeled client latency. Power invalidation is propagated; power and energy stay
null when it fails. GPU-board energy excludes host, chassis and facility energy.

## Synchronized clips

`VideoResultsClips` reads `format=published` once per selected artifact. It validates
source identity and matches prompt, seed, repetition and recorded generation
configuration before showing clips together. Missing media does not erase numeric
evidence. The shared transport seeks and plays real video elements, stops at the
shared playable duration, and pauses when the selection or page visibility changes.
Audio starts muted. The audio selector enables one visible, playable hardware clip
at a time; the reference stays muted. Changing the case or hiding or failing the
selected audio source restores mute. Audio selection is local playback state and
does not change the media, metrics, URL selectors or read-only API response.

Difference displays an amplified absolute RGB difference at matched playback time
against an explicitly bound official Diffusers reference MP4. Hardware and step
count alone never establish a reference. It fails closed for absent references,
unequal frame geometry or blocked cross-origin pixel access. This preview is not a
sealed PSNR result. Distilled and full-step workloads are not silently equated.
Per-tile wall time is the selected request's duration; energy is the cell's mean
J/valid clip and is labeled accordingly.
The default tiles show hardware, recorded GPU count, media, wall time, per-clip
PSNR when a sealed pair exists, mean energy and both modeled TCO bases. The reference
is a separate synchronized video with its recorded update/sigma-point counts and
no serving performance metrics. Prompt, seed, take, run, artifact,
runtime and media source remain in the keyboard-accessible Prompt & sources
disclosure. The Difference label identifies the amplified browser preview; its
help carries the full qualification.

## Per-clip quality

Per-clip quality is independent of the original candidate ZIP. The attachment binds
run, artifact, source, manifest, cell, slot, case, prompt, seed, media path and SHA256.
Model, generation, fairness and the selected plan case must match. Both original
full-plan hashes are retained when an unrelated case changed. Only completed cases
retained in the original reference receipt are eligible.

`evaluator.media.compare_media` compares every decoded RGB24 pixel/frame using
full-stream MSE and peak=1 after division by 255, without resizing, trimming or
best-offset alignment. Finite PSNR is shown in dB; exact decoded equality is labelled
separately with null PSNR. Missing and incompatible pairs stay empty. These are
descriptive cross-engine measurements, with no quality threshold or release claim.
The reference uses its recorded Diffusers revision and schedule; the current protocol
has 49 updates / 50 sigma points.

The UI and overview JSON share the same exact per-clip association. JSON returns
all groups under `clipQuality`, so case navigation changes presentation only.
The deployment detail's Validity tab links to these per-clip scores. Cell-granularity CSV has no
per-clip PSNR aggregate. Official and exact named channels retain their approval rules.

中文：质量附件独立于原始候选 ZIP，精确绑定运行、产物、来源、manifest、测量单元、slot、用例、prompt、seed、媒体路径与 SHA256。模型、生成配置、公平性配置和所选计划用例必须一致；其他用例发生变化时仍保留双方原始完整计划哈希。只使用参考回执中实际完成并保留的用例。PSNR 对比全部解码 RGB24 像素和帧；完全一致单独标注，缺失或不兼容配对保持为空。该数值不代表语义质量或发布合格。JSON 返回全部用例组，CSV 不虚构逐条 PSNR 汇总值，发布批准规则不变。

The local replay can also attach a separately sealed matched-noise diagnostic.
The existing case picker puts this labelled rerun first while retaining every
original CI case. Its videos, reference and PSNR use new native receipt/media
identities. Prompt & sources shows those native identities, not the original CI
run as the producer. Diagnostic tiles leave latency, energy and cost empty; the
performance dashboard continues to show the original cohort.

Overview JSON marks groups with `scope: ci | matched-noise-diagnostic`. Diagnostic
groups have null `take`, `pointId` and `slotId`; `contextPointId` and quality `origin`
identify the original CI context without assigning its measurements to the rerun.
The same shared grouping supplies the UI and API, including hidden/dismissed
overlays. No new URL selector is needed because the API returns every group.
Captured-noise and topology agreement describe the retained execution receipts,
not a calibrated quality verdict or proof of a hardware-only effect.

中文：本地回放还可加载独立封存的相同初始噪声诊断。现有用例选择器优先展示明确标注的重跑选项，同时保留全部原 CI 用例。新视频、参考和 PSNR 使用各自的 native 回执与媒体身份；来源面板显示实际 native 运行。诊断视频不沿用原 CI 的延迟、能耗或成本，下方性能图表仍展示原样本组。overview JSON 用 scope 区分 CI 与诊断；诊断的 take、pointId 和 slotId 为 null，contextPointId 与 origin 仅记录原 CI 上下文。UI 与 API 共用分组和叠加筛选，API 返回全部组，因此无需新增 URL 参数。噪声与拓扑记录一致不代表质量合格，也不能单独证明硬件效应。

## Cost and profit

Both bases are kept: participating boards and allocated boards. The chart and
table use the selected basis (`r_basis`, default participating); clip tiles and
the deployment detail show both. Video-seconds per $1 TCO is the reciprocal of
cost per video-second. Videos per GPU-hour = valid clips × 3600 / (wall seconds ×
the selected basis's GPU count), so the allocated basis halves it for a job that
reserved eight boards and used four. An
allocation must be evidenced; participating count is never substituted for it.
TCO per video = recorded GPU count × registry $/GPU-hour / measured clips/hour.
Cost per video-second = hourly GPU cost / `videoSecondsPerHour`, the validated
decoded output seconds per measurement wall hour. This rate includes only valid
measured requests and excludes warmup. Requested plan duration remains workload
and filter metadata: a 5-second request can produce 124 frames at 24 fps, or
5.1667 decoded seconds. Owning and rental tiers reuse `hardware.ts` and the shared
hardware registry. These are modelled costs, not measurements or API bills.

The estimator begins with empty price inputs. Each T2V/I2V/R2V price is a user
scenario for the selected resolution and duration. Unknown mode yields no assumed
mode price. Revenue/hour = validated decoded video-seconds/hour × utilization × entered price;
profit/hour subtracts the entire hourly GPU TCO for that basis. Both are normalized
by the corresponding GPU count for the plotted profit/GPU-hour. Utilization
reduces revenue, not the hours billed. Missing output duration for any valid
measured request, or a legacy History projection without `videoSecondsPerHour`,
leaves video-second throughput, per-video-second cost, revenue and profit null;
requested duration is never a fallback. Per-video costs can remain available.
This does not establish sustained capacity.

## Control coverage

Both language routes seed their first render with the URL-selected complete
History cohort and exact selected clip metadata. Hydration reuses successful and
known-missing reads; failures retain the existing retry path. Later media sources
appear independently without clearing matching clips. Videos use `preload=auto`
to request real first-frame bytes; no poster, generated frame or new media asset
is introduced. Cold upstream reads can still delay the server response. This is
a presentation-only loading change: the read-only API selectors, defaults,
calculations and official/unofficial source membership remain unchanged.

中文：中英文页面首次渲染即带有 URL 所选的完整有界 History 数据及对应视频元数据。
hydration 复用成功读取和已确认缺失的结果；失败仍可重试。后续媒体源独立显示，
不会先清空仍匹配的视频。视频通过 `preload=auto` 请求真实首帧字节，不新增封面或媒体产物。
冷启动时，上游读取仍可能延迟服务端响应。这只是加载方式的调整，不改变只读 API 的
选择项、默认值、计算或正式／指定运行的来源归属。

| Control                                                                                 | Read-only API coverage                                                                 |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Model, workload, resolution, duration, mode, steps, GPU count, engine, date             | `r_*` selection fields                                                                 |
| Hardware visibility, named stored run                                                   | `r_hidden`, `unofficialrun`, separate overlay cells preserving approval                |
| Deadline, cost tier, mode prices, utilization                                           | Same pure calculations in `resultProjection`                                           |
| Chart axes, cost basis, Optimal Only, open deployment                                   | `r_x`, `r_y`, `r_basis`, `r_optimal`, `r_point`; every axis value is in each cell      |
| Deployment labels, detail tab, pinned point                                             | Presentation only                                                                      |
| Clip transport, audio source, Difference, case navigation, History expand, theme, Share | Presentation only; published media metadata uses the existing read-only media contract |
| Cohort help, prompt/source and hash disclosures, media link                             | Presentation only; existing history and published media reads provide their data       |

Admin/publication handlers, private artifacts and credentials are excluded.
Video results controls and the new disclosures/media link record `video_results_*`
events. Shared `InfoHelp` retains its `selector_option_help_opened` event. Tests cover projection/API parity, both GPU bases,
nulls and invalid power, sample floors, overlay filtering, chart series for official
and overlay runs, legend filtering, deployment detail history, clip alignment, real
browser playback and difference failure, bilingual layout and 390px overflow.

## 中文说明

`/video` 与 `/zh/video` 共用结果页，沿用现有路由、功能开关、History 和封存媒体读取器。
比较要求固定的 20 条视频 C1 工作负载，每种硬件至少 10 个有效样本；完整身份包含模型版本、
生成参数、prompt、seed 和测量语义。较短 smoke、未完成及未匹配结果留在性能历史，不混入比较。
历史记录保留尚无发布批准的存储结果；默认图表仅接纳发布回执与原始来源及 checkout 匹配的记录。
发布批准与 full-sweep 或发布资格验收分开。
页面沿用推理与 AgentX 的两级布局。概览页首将筛选分为基准测试配置（模型、工作负载、引擎）、图表配置（X/Y 指标）、
部署（GPU 数量）和运行信息（运行日期）四组。图表绘制所选工作负载的全部实测部署：X 轴为单条视频 P50（默认）或 P90 延迟，
Y 轴为每 1 美元 TCO 生成的视频秒数（默认）、每 GPU 小时生成视频数或每条有效视频的 GPU 能耗；每种硬件及每个叠加运行
各自绘制 Pareto 前沿。右侧图例可隐藏硬件，没有匹配运行的硬件显示为灰色，GPU 口径与成本档位也在图例中切换。
图表下方的“代表性部署”表格每种硬件及每个叠加运行一行，展示按参与计算的 GPU 折算后每 GPU 小时生成视频数最多的部署，窄屏可横向滚动。
点击数据点会固定显示其测量值，再点击“查看遥测”进入部署详情（`r_point`）；点击表格行则直接进入详情。详情入口在 `history.state` 中做标记，
刷新或前进后页内返回仍会弹出该条目，浏览器后退也会回到原滚动位置；概览在后台保持挂载，视频、已加载的性能历史和图表状态不会丢失。
详情页分为遥测、有效性、来源三个标签页。未知、已筛除或已隐藏的 `r_point` 回到概览，结果加载后会从 URL 中移除，重新显示该硬件或分享时不会再打开它。如何解读、利润估算器与性能历史默认折叠，尚未采集的指标在“如何解读”中列出，
不使用占位图表或示意数值。功率无效时不展示功率或能耗结论。默认保留四个硬件视频窗口；
符合相同工作负载及样本门槛的已批准 H100 结果或明确指定的诊断运行会增加 H100 窗口，名称和成本沿用硬件注册表。

视频窗口只读取已存储产物，核对 prompt、seed、重复次数和生成配置后同步播放。
默认静音，可选择听一个硬件窗口的声音；参考视频保持静音。切换用例、隐藏音源或音源播放失败后恢复静音。音源选择只影响本地播放，不改变媒体、指标、URL 参数或只读 API 返回内容。
Difference 是相对明确绑定的官方 Diffusers 参考视频的浏览器 RGB 差异预览，与封存的全帧 PSNR 测量分别展示。不能根据硬件型号或步数推断参考身份。
参考视频、尺寸或跨域读取条件不满足时显示不可用。蒸馏与完整步数分组保留。
默认视频卡片保留硬件、GPU 数量、媒体及两种 TCO 口径；完整 prompt、seed、重复次数、
运行、产物、Runtime 和媒体来源可在“Prompt 与来源”中查看。

成本同时按参与计算和分配的 GPU 数量估算，分配证据缺失时不填补；图表与结果表使用所选口径（`r_basis`），视频卡片和部署详情同时展示两种口径。每 GPU 小时生成视频数同样按所选口径的 GPU 数折算：作业分配 8 张、实际使用 4 张时，按分配口径计算的值减半。视频秒吞吐量、每视频秒成本及收入使用有效测量请求的实际解码视频时长，不包含 warmup；请求时长仅用于工作负载身份与筛选。
任何有效测量请求缺少视频时长，或旧 History 投影没有 `videoSecondsPerHour` 时，上述指标及利润保持为空，不以请求时长代替。每条视频成本仍可在证据充分时计算。利润输入默认空白，属于用户
场景假设；利用率只降低收入，不减少付费时长。模式未知时不套用 T2V/I2V/R2V 价格。
只读 API 与页面共用选择和计算逻辑，`r_*` 参数可以分享，`?unofficialrun=` 只读取指定的已存储运行，
保留其发布批准状态，并单独放入 overlayCells 和 overlayDeploymentCells；选中期间，即使已批准也不进入正式结果、部署或工作负载构成。overlayCells 按所选 GPU 数筛选结果表和视频；overlayDeploymentCells 保留所有匹配的 GPU 数，用于图表和部署详情。
默认优先选择有已批准结果的工作负载；仅由指定运行提供的工作负载须明确选择，
或在没有匹配的已批准结果时作为回退。
支持隐藏硬件及移除；清除叠加运行后不会将未批准数据转为正式结果。
移除时，工作负载选择仅在已批准选项中仍然有效时保留。overview 默认返回 JSON；`format=csv` 下载当前筛选的正式及指定运行数据点，保留来源、工作负载、运行、产物和批准状态，标明单位及两种 GPU 成本口径。`duration_s` 保留计划请求时长，`video_seconds_per_s` 表示每测量秒生成的有效解码视频秒数。缺失值保留为空单元格，CSV 不缓存。
读取不会启动 GPU、写入 Blob 或发布媒体。测试覆盖 API 一致性、样本门槛、
两种成本口径、缺失证据、图表中的正式与叠加数据点、图例筛选、部署详情历史记录、同步视频与中英文 390px 布局。
