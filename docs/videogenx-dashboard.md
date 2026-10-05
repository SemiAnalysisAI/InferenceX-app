# VideoGenX dashboard (/video)

Why `/video` leads with a cross-hardware chart instead of a CI-run browser, and the rules its metrics obey. Component code lives in `packages/app/src/components/video-benchmark/` (`VideoDashboard.tsx` is the root).

## Data path

Published blob indexes → `GET /api/video-runs?format=history` (the per-cell projection described in [Video performance history](./video-history.md), with additive nullable fields for GPU counts, wall time, clip shape, board power, enforced limit and server layout) → `points.ts` (`videoPoints`, `latestVideoCells`) → `metrics.ts` (`metricValue`). The browser reads at most five history pages and never parses an artifact bundle for the chart. The previous CI-run viewer has been removed: `history-*` links open Performance history; Compare loads published media on demand. The public `/api/v1/views/video` dashboard projection reuses these selectors and formulas; explicit legacy views remain available through the API.

## Axes and defaults

`video-url-state.ts` owns the `v_*` URL params (`v_x`, `v_y`, `v_quality`, `v_qmin`, `v_tier`, `v_view`, `v_optimal`, `v_api`, `v_hidden`); defaults are omitted from the URL and every other param is left alone.

- **X = P90 time to video (s)**, lower is better; `p50Latency` is the alternative.
- **Y = videos per $1 TCO** at the _Owning at Large Hyperscaler Volume_ tier; TCO cost per video, videos per GPU-hour and GPU-board energy per video (kJ) are the alternatives. Cost per GPU-hour comes from `HW_REGISTRY` (`costh`/`costr`), the same SemiAnalysis TCO source `/inference` uses; the badge row and source link sit above the chart.
- **Per participating GPU**: every per-GPU metric divides by the boards that generated the clip (4 per video with TP2 × Ulysses 2), never by the boards a job reserved. The retained H100 and B200 jobs reserved eight and used four, so a note under the chart header names them ("B200 (4 of 8), H100 (4 of 8) … the idle boards are not counted") and their KPI card headers read "4 of 8 GPUs". Idle boards are stated, not billed; there is no GPU-basis toggle.
- **Quality**: `v_y=quality` uses one human rubric dimension selected by `v_quality`; `v_qmin` optionally filters that dimension before frontier computation on any Y axis. Defaults stay P90 versus videos per $1 TCO; the retained deployment preview explicitly selects `v_y=videosPerGpuHour`. The seven original dimensions are prompt adherence, visual fidelity, temporal consistency, motion plausibility, audio quality, audio content and audiovisual synchronization. All preserve higher-is-better 0–4 ratings, never an overall mean. Quality admission requires complete calibrated evidence for every critical dimension; the selected dimension supplies only the Y coordinate or extra reader threshold. See the qualification boundary below.
- **Both axes start at zero** (`chart-domain.ts`), so per-dollar and per-video readings compare by length, not by offset.
- **Chrome mirrors `/inference`**: a `Card` with `DashboardSectionHeader` (title, description, Share) sits above the two config panels; the cost tier is picked inline in the chart caption (`video-cost-tier`, a `SearchableSelect` with an `export-only` text twin) like the inference caption's Cost Tier selector; the Compare and performance evidence sections fold behind a chevron (`CollapsibleSection`), and Compare opens on load for `v_base`/`v_cand`/`v_case` deep links. The video route declares `shareParamScopes: ['v_']`, and `collectTabParams` reads that scope live from the address bar, so Share links carry the current `v_` params. Hidden hardware is canonicalized in `v_hidden`; it filters the chart, table and CSV while KPI cards, Compare and evidence retain the selected workload.

## Deployments, not concurrency, make the curve

`/inference` sweeps batch size to trace each hardware's latency-vs-throughput frontier. The retained fixture uses a batch-one, single-replica H3 server: its C1/C2/C4 cells show throughput within ±1.5 % while latency grows with C. This describes that recorded configuration; it is not a claim about every diffusion server or future runtime. Joining those cells would draw a flat "curve" that measures the queue, not the hardware, so the chart never does.

A measured deployment is identified by participating GPUs, GPUs per replica, replica count, TP/Ulysses/Ring/CFG layout, attention, offload, encoder parallelism, actual/configured batch settings, scheduling, engine, precision, acceleration and generation identity when recorded. Missing settings stay null. Distinct identities remain distinct cells. The legacy batch-one single-endpoint fallback applies only to old records; modern batching records require known capacity. Unknown dynamic-batch capacity and recorded hardware-health failures are excluded from normal performance rankings.

`plot.ts` filters eligible deployment observations before computing the per-hardware frontier. Comparisons require an explicit canonical workload and compatible generation settings; quality mode additionally groups by contract, rubric, dimension, evaluator and calibration identity. A single measurement is a point. Lines connect measured frontier points only, without interpolation or extrapolation. Optimal Only preserves tied nondominated configurations. Chart, table, CSV and the public API share the selection and metric functions.

The committed regression fixture retains the historical single-deployment-per-hardware scatter. A development-only retained-data replay can additionally expose verified H200/B200 2/4/8-GPU deployments without replacing that fixture, publishing data or rerunning generation.

## Quality evidence and empty state

Goal 1's H3 Quality Contract v0 defines a blinded seven-dimension 0–4 rubric but has no completed judgments or accepted thresholds. Existing integrity checks, PSNR and audio spectral similarity remain separate technical evidence. The app uses the original rubric IDs with an explicit `scale: ordinal_0_to_4` declaration and registry version `0.2.0-draft`. Legacy 1–5 or missing scale declarations are not converted or admitted. All critical dimensions retain their own evaluator, calibration and frozen rule in cohort identity. A/A diagnoses numerical repeatability; it does not calibrate acceptable perceptual quality.

`quality.ts` requires a `pass` for each of the seven critical dimensions, finite in-range value, protocol/rubric/evaluator identities and hashes, complete assessed-clip coverage matching the point, and a calibrated frozen threshold with cohort, time and provenance. It checks every critical dimension before the reader's optional threshold on the selected dimension. The reader cannot weaken the frozen rule. Raw `judged_unqualified`, failed or partial assessments can remain in point metadata but have a null eligible value. Unknown or uncalibrated data produces a useful empty quality view; no metric is imputed from media validity.

Point details and API records retain deployment/generation settings, sample/failure counts, source/run/artifact identities and available evidence links. Modelled TCO assumptions remain separate from measured GPU-board energy. Generation-setting changes remain explicit comparison cohorts; a speed observation alone cannot establish equivalent quality.

## Sections below the chart

- **API price reference** (`api-reference.ts`, `VideoApiReference.tsx`): a dated, editable USD per video-second list price (`v_api`, default `H3_API_REFERENCE`) feeds exactly one derived number, the API list price per video (`apiPricePerVideo` = price × clip seconds). It is shown beside the TCO cost per video on the KPI cards and as a table and CSV column; the chart never plots it, and no revenue, profit or price multiple is derived from it. The default records the MiniMax platform pay-as-you-go page captured on 2026-09-24 (the source has no effective date); it is a dated list-price input, not a current price guarantee; a null or non-positive price nulls the list price, and `parseApiPrice` falls back to the reference rather than pricing at 0.
- **Compare** (`compare.ts`, `compare-url-state.ts`, `VideoCompare.tsx`): arena-style baseline vs. candidate, video first — the same prompt + seed clips from both CI runs play side by side with shared play/pause/restart and previous/next case arrows (no blind mode, no case dropdown); the deltas below are fixed to time to video (P50), TCO cost per video and energy per video (`COMPARE_METRICS`, registry polarity), with the cost tier stated in a footnote. One selectable cell per hardware (its lead deployment), defaulting to the slowest hardware as baseline and the fastest as candidate; `v_base`, `v_cand`, `v_case` in the URL. The two stored artifacts (several MB each) load once the panel scrolls into view; an HTTP 204 side reads as "clips not published", never as an error.
- **Performance evidence** (`evidence.ts`, `VideoEvidence.tsx`): recorded board-power ratios, concurrency throughput/latency ratios and observed speed-ups beside memory-bandwidth/FLOPS specifications. Cross-hardware rows require a known canonical workload, a complete matching deployment layout and C1 (`sharedLayoutCells`); unmatched hardware is omitted, never replaced with its lead cell. Concurrency ratios require a matching workload, layout and replica count. The copy reports numbers without inferring power saturation, a throughput plateau or a compute/memory bottleneck. These mechanisms need separate experiments and telemetry.

## Rules

- **Unavailable hardware** stays visible. `VIDEO_HARDWARE_ROSTER` in `hardware.ts` lists the campaign targets; MI355X has no valid run and renders as a muted legend row, a "Not measured" KPI card with the failed-run link, and no table row. A missing point is never a zero.
- **Nulls**: every formula returns `null` when an input is missing or invalid — power phase invalid, fewer than ten samples for P90, unknown hardware key, missing GPU count. `formatMetric` prints `—`.
- **Newest observation wins**: `latestVideoCells` keeps the first (newest publication) observation per hardware × deployment × concurrency, so a re-run replaces, never duplicates, a point, while a new server layout adds one.
- **One workload, real samples**: the additive `workloadKey` preserves the full canonical workload identity from the source, including prompts and seeds; the shortened workload label is display text only. Missing identity stays null and is isolated by original source manifest. Runtime revision remains a disclosed comparison variable. `dashboardCells` keeps only the workload measured on the most hardware and drops cells with fewer than ten valid clips (the P90 floor), so a smoke run of a shorter plan never becomes a point, a KPI lead or a Compare side; the Performance history list still shows it, and the Workload fact counts the hidden workloads.
- **Strings**: component-local `STRINGS = { en, zh }` via `useLocale()`; SKUs, units and identifiers stay English.
- **Fixture**: `cypress/fixtures/api/video-history.json` is rebuilt from retained `StoredArtifact` exports with `bun run fixtures:video-history <dir>` (`scripts/build-video-history-fixture.ts`); it is metadata only and registered in `_manifest.json`.

## Serving outcome accounting

The serving evidence table and public API `serving` rows retain every planned cell in the loaded history pages before chart, workload, hardware or quality filters. They include zero-sample cells and source errors. Counts distinguish scheduled, attempted, completed, failed attempts, timed out (a subset of failed attempts), not started, valid and unjudged. The old failed-slot total is retained separately as `legacyFailedSlots`; it must not be read as attempted failures. Unknown evidence stays null.

A complete request ledger and absent quality sidecar establish valid outputs as unjudged. Aggregate quality labels alone do not establish a clip-level partition. `qualitySloGoodput` stays null until media-bound quality judgments and delivery-deadline evidence can be joined for each request. This table accounts for outcomes; it does not qualify production serving or perceptual quality.

## 中文说明

质量视图通过 `v_y=quality` 选择，`v_quality` 指定提示词遵循度、视觉保真度、时序一致性、运动合理性、音频质量、音频内容或音画同步，七项独立保留越高越好的 0–4 级评分，不合成为总分。七项关键维度均须有完整、已校准且通过冻结规则的证据；所选维度仅决定纵轴数值或额外筛选阈值。旧 1–5 量尺或缺少量尺声明的记录不会被转换或准入。A/A 只检查数值重复性，不能确定感知质量的可接受标准。`v_qmin` 可在计算 Pareto 前增加读者阈值，但不能放宽已冻结的协议规则。原默认 P90 对每美元视频数保持不变；保留部署预览显式选择每 GPU 小时视频数。

质量入选要求包括逐维度通过判定、完整样本覆盖、协议/rubric/evaluator 身份及哈希、已校准阈值与来源。Goal 1 v0 尚无已完成人工评分或校准门槛，因此当前质量视图为空；技术完整性、PSNR 和音频频谱相似度不能替代质量评价。原始已评但未获资格的分数可以保留在元数据里，不能进入质量前沿。

部署身份扩展到已记录的副本数、每副本 GPU 数、Ring/CFG、offload、batch、调度、engine、precision、加速方法及生成配置，缺失值保持 null。只有相同 workload 和兼容生成配置内的实测点可以比较，质量模式另按协议及 evaluator 分组。硬件健康失败和未知 batch 容量排除出正常排名；单点保留为散点，连线只连接已测前沿点。开发环境可以读取 H200/B200 2/4/8-GPU 保留数据，原回归 fixture 保持独立。

`/video` 以跨硬件图表为首屏：数据来自已发布 blob 索引的 per-cell 投影，浏览器不再为图表解析产物包；已发布结果的“性能历史”列表收进可展开区块，`history-*` 深链接会自动展开；原有的按运行查看、trade-off 图表与 CI 运行浏览已移除。仪表板只取硬件覆盖最广的那个工作负载，并剔除有效视频不足 10 条的 cell（与 P90 门槛一致），因此较短 plan 的 smoke 运行不会成为图上的点、KPI 领先部署或 Compare 的一方，但仍会出现在性能历史列表中；工作负载一栏会注明隐藏的其他工作负载数量。`video-url-state.ts` 管理 `v_x`、`v_y`、`v_tier`、`v_view`、`v_optimal`、`v_api`、`v_hidden` 等 URL 参数，默认值不写入 URL。页面外观与 `/inference` 对齐：标题、说明和分享按钮放在同一张 Card 的 DashboardSectionHeader 中，两组配置面板位于其下；成本档位改为在图表说明行内选择；Compare 与性能测量证据两个区块默认折叠，携带 `v_base`/`v_cand`/`v_case` 的深链接会自动展开 Compare；分享按钮会带上当前的 `v_` 参数。`v_hidden` 保存隐藏的硬件，作用于图表、表格和 CSV；KPI 卡、Compare 和证据面板仍展示所选工作负载。X 轴可选 P90（默认）或 P50 出片时间；Y 轴可选每 1 美元 TCO 视频数（默认，Hyperscaler 自有设备档位，单价与 `/inference` 同源）、每条视频 TCO 成本、每 GPU 小时视频数和每条视频 GPU 板卡能耗（kJ）。所有按 GPU 计的指标都以参与计算的 GPU 为分母（例如历史 fixture 每条视频 4 张，TP2 × Ulysses 2），而不是任务预留的板卡数；保留数据中 H100 与 B200 的运行预留了 8 张却只用 4 张，图表标题下方的说明会点名这些硬件，对应 KPI 卡标题显示“4 / 8 张 GPU”。空闲板卡只作说明、不计成本，没有 GPU 口径切换。两条坐标轴都从 0 起，便于按长度比较。

曲线来自部署而不是并发：保留的 fixture 使用 batch-one、单副本 H3 服务，C1/C2/C4 的吞吐量相差不到 1.5%，延迟随 C 增长；这只描述该次配置，不代表所有 diffusion 服务或未来 runtime。仪表板将旧 batch-one 记录中超过副本数的并发视为同一部署的排队观测，不把这些点连成部署曲线。真正在延迟与效率之间取舍的是部署方式：每条视频占用多少张 GPU 以及模型如何切分（`tp_size` × `ulysses_degree`）。`deployment.ts` 使用上述完整部署身份；旧 batch-one 记录仍按 `concurrency > replicas` 判断排队，现代记录按已知容量判断，并为每种硬件选出最高效的部署作为代表（KPI 卡、Compare 面板和图例都用它）；`plot.ts` 只用未排队的 cell 绘图——排队 cell 不会进入图表、表格和 CSV，只出现在证据面板——再按硬件对剩余部署点求 Pareto 前沿：某硬件有两个及以上前沿部署时自动画出实线，被支配的部署以淡色显示。唯一的开关是图例中的“仅最优”（`v_optimal`，默认开启，与 inference 页的 `i_optimal` 一致）：开启时图表、表格和 CSV 只包含前沿部署，关闭后被支配的部署以淡色加入图表；没有“显示排队请求”开关，也没有跨硬件前沿。保留的仪表板 fixture 中，每种已测硬件只有一种实测部署（每条视频 4 张 GPU，TP2 × Ulysses 2），所以图表是诚实的三点散点图，说明文字会指出每硬件曲线还需扫描每条视频占用的 GPU 数；该扫描属于 InferenceX 后端工作并需要 GPU 授权，前端按已记录的完整部署和工作负载身份接收新 cell。MI355X 以“未测得”形式保留在图例与 KPI 卡中；缺失指标一律为 null，绝不写成 0。

图表下方还有三个区块。带日期、可编辑的 API 参考价（`v_api`，记录 MiniMax 开放平台按量付费页在 2026-09-24 的价格，页面未标注生效日期；不保证当前仍适用）只推导一个数字——每条视频 API 标价（单价 × 视频秒数），显示在 KPI 卡每条视频 TCO 成本旁边，并作为表格和 CSV 的一列；它不进入图表，也不再推导收入、利润或价格倍数。价格缺失或不为正时该值为 null，`parseApiPrice` 会回退到参考价，而不是按 0 计价。Arena 式 Compare 以视频为主：同一 prompt 与 seed 在两种硬件上的视频并排播放，支持同步播放/暂停/重播和上一个/下一个用例箭头，没有盲测模式，也没有用例下拉框；下方的差值行固定为出片时间（P50）、每条视频 TCO 成本和每条视频能耗，并以脚注注明成本档位。每种硬件只有一个可选 cell（其代表部署），默认以最慢的硬件为基线、最快的为候选，选择记录在 `v_base`、`v_cand`、`v_case` 中；面板滚入视口时才加载两个已发布产物，HTTP 204 读作“未发布视频”而不是错误。性能测量证据面板展示板卡功率相对生效上限的比值、并发下的吞吐量和延迟比值，以及带宽/FLOPS 规格比与实测加速比。跨硬件比较要求完整且相同的工作负载身份、完整部署布局和 C1；缺少匹配布局的硬件直接省略，不回退到其代表部署。并发比较还要求相同副本数。文案只描述数值，不据此断言功率饱和、吞吐量平台或计算/内存瓶颈。

完整工作负载身份由附加字段 `workloadKey` 保存，包含 prompts 与 seeds；缩写标签只用于显示。身份缺失时保持 null，按原始 source manifest 隔离，不跨来源合并。runtime revision 作为比较变量单独披露。仪表板最多读取五页历史；公开 `/api/v1/views/video` 默认复用相同选择与计算逻辑，旧 API 视图仍可显式指定。

请求结果表与公开 API 的 `serving` 行在图表、工作负载、硬件和质量筛选之前，保留已加载历史页中的每个计划 cell，包括零样本 cell 和来源错误。计划、尝试、完成、尝试后失败、超时（尝试后失败的子集）、未启动、有效和未评判分别计数；旧失败 slot 总数单独保存为 `legacyFailedSlots`，不能当作尝试后失败。未知证据保持 null。只有完整请求记录且没有质量 sidecar 时，才能把有效输出记为未评判；聚合标签不能推导逐视频分区。质量与截止时间证据尚未逐请求关联时，`qualitySloGoodput` 保持 null。

### Local multi-model foundation

`/video?v_model=wan22` and `/api/v1/views/video?v_model=wan22` select Wan2.2-T2V-A14B;
`h3` is the default. Model filtering precedes workload selection and applies to charts,
tables, exports, serving evidence and history provenance. Switching models resets custom
pricing, hidden hardware and comparison/history selections. H3 retains its dated $0.08/video-second
reference; Wan's API price is null unless the reader supplies `v_api`. Missing results remain
empty. The serving reader accepts `video-serving-<run>-<attempt>` artifacts with
`video_serving_smoke_matrix`, `controlled_video_gpu` and `live_video` evidence while preserving
legacy H3 contracts. Evidence tags must agree with the selected model; `operator_endpoint` request records remain valid under either model's verified supervisor. Wan request duration is `frame_count / fps`; H3 keeps its explicitly requested duration. Wan's canonical model ID is `Wan-AI/Wan2.2-T2V-A14B-Diffusers`;
the previous `Wan-AI/Wan2.2-T2V-A14B` remains a selection alias, not permission to pool unequal workload keys.
`manifest.workload_plan.model_id` supplies source-level identity even before generation;
a contradictory optional result is rejected. API provenance returns nullable source `model`.
A sealed initial serving summary supplies planned/not-started counts; a manifest alone cannot infer them.
This reader does not itself establish GPU measurements, quality qualification or Trainium support.
Only legacy `h3-*` artifacts without model identity use the H3 fallback; unidentified generic artifacts do not enter either model projection.
Ambiguous mixed-model sources are excluded. H3's seven-dimension quality policy is unchanged;
Wan quality and quality/SLO goodput stay null until a separate video-only quality contract is supported.

Wan serving 接入沿用既有目录和校验流程，接受 `video-serving-<run>-<attempt>`、
`video_serving_smoke_matrix`、`controlled_video_gpu` 和 `live_video`，同时兼容 H3。执行证据类型须与模型一致；经对应模型 supervisor 验证的请求记录仍可使用 `operator_endpoint`。Wan 的请求时长按 `frame_count / fps` 计算，H3 保留显式请求时长。
规范模型 ID 为 `Wan-AI/Wan2.2-T2V-A14B-Diffusers`，旧的 `Wan-AI/Wan2.2-T2V-A14B`
仅作为模型选择的别名，不会合并不同的工作负载。来源身份取自已封存的
`manifest.workload_plan.model_id`；可选结果中的模型与之冲突时会拒绝该结果。
公开 API 的 provenance 保留可为空的来源 `model`。只有旧 `h3-*` 产物可在模型身份缺失时归入 H3；未知模型的通用产物不会进入任一模型投影。预检失败的计划数与未启动数
必须由初始 serving summary 明确记录，不能只凭 manifest 推导。接入成功不代表
已有 GPU 测量、通过质量验收或支持 Trainium；Wan 的质量与质量/SLO goodput 仍为 null。
