import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
} from '@/lib/api/api-documentation';
import { API_BASE_URL } from '@/lib/api/api-documentation-base';
import { VIDEO_HISTORY_MAX_PAGES } from '@/components/video-benchmark/history';
import { text } from '@/lib/api/api-documentation-helpers';
import { VIEW_QUERY_PARAMS, type ReadonlyView } from '../registry';

const object: ApiSchema = { type: 'object', additionalProperties: true };
const objects: ApiSchema = { type: 'array', items: object };
const strings: ApiSchema = { type: 'array', items: { type: 'string' } };
const imageAgePoint: ApiSchema = {
  type: 'object',
  properties: {
    date: { type: 'string', format: 'date' },
    p90AgeDays: { type: ['integer', 'null'], minimum: 0 },
    configurationCount: { type: 'integer', minimum: 0 },
  },
  required: ['date', 'p90AgeDays', 'configurationCount'],
  additionalProperties: false,
};

const PARAMETER_NOTES: Record<string, [string, string]> = {
  model: [
    'Model display name or comparison slug, case-insensitive. Required for benchmark-based views. The image view also accepts current image-catalog names, trims whitespace and defaults to all; unknown models return 400.',
    '模型显示名称或比较页 slug，不区分大小写。基于基准测试的视图需要此参数。镜像视图还接受当前镜像列表中的模型名，去除首尾空白后匹配，默认 all；未知模型返回 400。',
  ],
  sequence: [
    'Workload: 1k/1k, 1k/8k, 8k/1k or agentic-traces. AgentX extension views default to agentic-traces.',
    '工作负载：1k/1k、1k/8k、8k/1k 或 agentic-traces。AgentX 扩展视图默认使用 agentic-traces。',
  ],
  date: [
    'Snapshot cutoff date, YYYY-MM-DD. runId selects an exact logical run snapshot instead.',
    '快照截止日期，格式为 YYYY-MM-DD。指定 runId 时改为读取该次运行的逻辑快照。',
  ],
  runId: [
    'Positive safe integer workflow run ID. Omit to select the default run; required for GPU metrics.',
    '正安全整数格式的工作流运行 ID。不填时选择默认运行；GPU 指标必须填写。',
  ],
  precisions: [
    'Comma-separated precision keys; omitted selection uses available curve density. Calculator extensions auto-select the densest official precision and include precisions present in unofficial-run overlays.',
    '以逗号分隔的精度键；省略时按可用测试曲线数量选择。计算器扩展视图选择官方数据中曲线最多的精度，并纳入 unofficial-run 叠加数据中的精度。',
  ],
  gpus: [
    'Comma-separated hardware/config keys; for gpu-metrics use numeric GPU indices. Omit for all.',
    '以逗号分隔的硬件或配置键；gpu-metrics 使用数字 GPU 索引。省略时选择全部。',
  ],
  percentile: [
    'AgentX latency percentile p75 or p90; CollectiveX supports p50, p95, p99.',
    'AgentX 延迟分位数为 p75 或 p90；CollectiveX 支持 p50、p95、p99。',
  ],
  tcoBasis: [
    'internal (default) or external. Applies the same configured owning/rental cost basis as the UI.',
    'internal（默认）或 external，使用与界面相同的自有或租赁成本口径。',
  ],
  unofficialrun: [
    'Up to eight comma-separated public CI run IDs. Surrounding whitespace and duplicates are removed; run indices follow the remaining order. Overlay sources remain separate from official data.',
    '最多八个公开 CI 运行 ID，以逗号分隔。去除各项首尾空白和重复 ID 后，按剩余顺序分配运行索引。叠加结果与官方数据分开。',
  ],
  dates: [
    'Up to twelve comma-separated YYYY-MM-DD or YYYY-MM-DD~rRUN_ID comparison entries. Date-only entries select that exact logical snapshot, not an as-of cutoff; run entries select the exact logical run snapshot. Each snapshot is evaluated independently.',
    '最多十二个比较项，以逗号分隔，格式为 YYYY-MM-DD 或 YYYY-MM-DD~rRUN_ID。仅含日期时读取当天的逻辑快照，不按截止日期向前回溯；含运行 ID 时读取该次运行的逻辑快照。各快照独立计算。',
  ],
  start: [
    'Comparison range start, YYYY-MM-DD. With end, adds the two endpoints, not every intermediate date. Historical uses an inclusive data bound.',
    '比较范围起始日期 YYYY-MM-DD。与 end 一起只加入两个端点，不加入中间所有日期。历史视图将其用作含起点的数据范围。',
  ],
  end: [
    'Comparison range end, YYYY-MM-DD; must not precede start. Historical uses an inclusive data bound.',
    '比较范围结束日期 YYYY-MM-DD，不得早于 start。历史视图将其用作含终点的数据范围。',
  ],
  target: [
    'Positive operating-point target, tok/s/user in interactivity-to-throughput mode. Both profit views use model-specific defaults: Kimi K3 60, GLM-5.2/5.3 135, MiniMax M3 115, DeepSeek V4 Pro 170 and DeepSeek V4.1 Flash 150 tok/s/user. Dashboard links use /<model>/target/<value> route segments; this API continues to accept the target query parameter. These are editable SKU-coverage assumptions, not OpenRouter P90-equivalent measurements.',
    '正数工作点目标；交互性转吞吐量模式下单位为 tok/s/user。两个利润视图按模型设置默认值：Kimi K3 为 60、GLM-5.2/5.3 为 135、MiniMax M3 为 115、DeepSeek V4 Pro 为 170、DeepSeek V4.1 Flash 为 150 tok/s/user。仪表板链接通过 /<model>/target/<value> 路径片段传递目标值；本 API 仍使用 target 查询参数。这些默认值是用于扩大 SKU 覆盖范围的可修改假设，并非与 OpenRouter P90 等价的实测值。',
  ],
  costProvider: [
    'costh = owning, costr = renting. Profit views additionally accept custom with customCosts. No costn provider.',
    'costh 为自有成本，costr 为租赁成本。利润视图还支持 custom，需配合 customCosts。不支持 costn。',
  ],
  costType: [
    'total (default), input or output tokens. Disaggregated input/output rates retain their prefill/decode denominators.',
    'total（默认）、input 或 output token。分离式输入和输出速率保留各自的 prefill、decode 分母。',
  ],
  hideSkuAboveConfigLimit: [
    'Boolean, default true. Omit hardware whose interpolation clamps above its measured configuration limit.',
    '布尔值，默认为 true。排除目标超出配置实测上限的硬件。',
  ],
  caps: [
    'One to eight positive finite first-token caps in seconds, sorted and deduplicated; default 2,5,10,15,20. Any invalid entry returns 400.',
    '一至八个有限正数，表示首 token 时间上限（秒）；排序去重后使用，默认 2,5,10,15,20。任一值无效时返回 400。',
  ],
  minInteractivity: [
    'Minimum tok/s/user, default 150 for AgentX or 35 for fixed-length workloads.',
    '最低 tok/s/user，AgentX 默认 150，固定长度工作负载默认 35。',
  ],
  config: [
    'Exact cache-reuse configuration key from configurations. Omit for the shared dashboard default.',
    'configurations 中的缓存复用配置键。省略时采用仪表板默认配置。',
  ],
  recipe: [
    'Exact key from data.recipes (dashboard c_recipe). Missing or unknown keys select the recipe with the most tiered rows, then most rows, then label; overlays supply choices only without official rows. params.recipe reports the resolved key.',
    'data.recipes 中的方案键，对应仪表板 c_recipe。省略或未知键按缓存层级数据行数、总行数和标签依次选择默认方案；仅在没有官方数据时使用叠加运行的方案。params.recipe 返回实际选择的键。',
  ],
  cacheHitMode: [
    'actual or theoretical (default, displayed as Theroticial Roofline). Actual uses the server-measured cache hit rate from the benchmark; theoretical uses the infinite-cache rate computed from the trace, falling back to the measured rate when unavailable.',
    'actual 或 theoretical（默认，界面显示为 Theroticial Roofline）。Actual 使用基准测试中服务端实测的 cache 命中率；theoretical 使用 trace 计算的无限缓存理论命中率，缺失时回退到实测值。',
  ],
  customCosts: [
    'JSON object from base hardware keys to finite nonnegative USD/chip-hour values, at most 100 entries.',
    'JSON 对象，将基础硬件键映射为有限非负美元/芯片小时，最多 100 项。',
  ],
  userCosts: [
    'JSON object from hardware keys to finite nonnegative USD/chip-hour values for user-priced metrics.',
    'JSON 对象，将硬件键映射为有限非负美元/芯片小时，用于自定义成本指标。',
  ],
  userPowers: [
    'JSON object from hardware keys to finite nonnegative power assumptions in kW/chip.',
    'JSON 对象，将硬件键映射为有限非负千瓦/芯片功率假设。',
  ],
  priceSource: [
    'Profit: list, openrouter or custom. Inference/history: normalized or openrouter. Returned pricing records the prices actually used.',
    '利润视图支持 list、openrouter、custom；推理和历史视图支持 normalized、openrouter。响应 pricing 记录实际使用的价格。',
  ],
  inputPrice: [
    'Custom uncached input USD/million tokens, default 1.',
    '自定义未缓存输入价格，单位 USD/百万 token，默认 1。',
  ],
  cachedInputPrice: [
    'Custom cached input USD/million tokens, default 0.1.',
    '自定义缓存输入价格，单位 USD/百万 token，默认 0.1。',
  ],
  outputPrice: [
    'Custom output USD/million tokens, default 1.',
    '自定义输出价格，单位 USD/百万 token，默认 1。',
  ],
  utilization: [
    'Utilization percent from 0 through 100, default 60.',
    '利用率百分比，范围 0 至 100，默认 60。',
  ],
  labCut: [
    'Model license/revenue-share percentage, 0 through 100; model-specific default.',
    '模型许可或收入分成百分比，范围 0 至 100，默认值随模型变化。',
  ],
  powerBasis: [
    'provisioned (default, All in Provisioned), modeled (All in Measured) or compare. For GW-year estimates, modeled filters source points to valid system-power inputs before building the curve at the same target, without extrapolation or historical substitution. compare uses identical valid-curve throughput for paired budgets; when no valid curve reaches the target, it retains the original provisioned estimate. provisioned-only keeps the original performance curve. All in Measured adds modeled components and PUE to measured inputs; it is not measured wall power. NVL72 rows need validated GPU telemetry; each compute tray takes an equal share of a modeled liquid-cooled rack, with measured Grace-socket power when the row has complete validated socket telemetry (CPU-rail-only and module-sensor readings are not accepted) and modeled Grace power otherwise. Both interpolation knots must share a power basis. powerSource records topology (chassis or nvl72-tray), cpu (measured or modeled), PUE and the pinned power-model revision. powerLabel marks paired estimates and full-chassis extrapolation; skipped reasons preserve missing coverage.',
    'provisioned（默认，整体预配功耗）、modeled（整体实测功耗）或 compare。按 GW 年估算时，modeled 先筛选满足系统功耗要求的数据点，再在同一目标值上构建曲线，不外推，也不借用历史数据。compare 的两种功耗方案使用同一条有效曲线的吞吐量；没有有效曲线覆盖目标时，保留原曲线的预配估算。provisioned 单独使用时仍沿用原性能曲线。整体实测功耗在实测输入上叠加组件估算和 PUE，并非墙上电表读数。NVL72 需要通过验证的 GPU 遥测，每个计算 tray 平均分摊建模液冷机架的功耗；带有完整且通过验证的 Grace socket 遥测时使用实测 Grace 功耗（不接受仅有 CPU rail 或模块传感器的读数），否则使用 Grace 功耗估算值。插值的两个数据点须采用相同功耗口径。powerSource 记录拓扑（chassis 或 nvl72-tray）、cpu（measured 或 modeled）、PUE 和固定的功耗模型版本；powerLabel 标明配对估算和整机外推，skipped 保留覆盖缺失原因。',
  ],
  power: [
    'Comma-separated certified and/or legacy power tiers. Omit for all tiers.',
    '以逗号分隔的 certified、legacy 功率数据等级。省略时选择全部等级。',
  ],
  topologies: [
    'Comma-separated exact topology keys from the Dashboard topology selector or view point topologyKey. Filters allocation and parallelism without filtering concurrency; omitted means all. Preserve the keys verbatim. Unknown keys return no matching points.',
    '逗号分隔的精确拓扑键，取自仪表板拓扑选择器或数据点的 topologyKey。按 GPU 分配和并行配置筛选，保留全部已测并发；省略时不限制拓扑。原样使用这些键，未知键不会匹配数据点。',
  ],
  allPoints: [
    'Boolean, default false. Include points clipped by dashboard limits; optimal and best still apply independently.',
    '布尔值，默认为 false。包括被图表范围裁剪的数据点；optimal 和 best 仍独立生效。',
  ],
  extendToDate: [
    'Synthetic history-line end date, YYYY-MM-DD; defaults to current UTC date, matching the dashboard.',
    '历史曲线补齐至此日期，格式为 YYYY-MM-DD；默认当前 UTC 日期，与仪表板一致。',
  ],
  asOf: [
    'Reference date YYYY-MM-DD for reproducible rolling reliability or image-age calculations.',
    '用于复现滚动可靠性或镜像日期差计算的参考日期 YYYY-MM-DD。',
  ],
  includeHistory: [
    'true or false (default). Include 90 daily UTC image-age points ending on asOf, with nearest-rank p90AgeDays and configurationCount. Covers the same configurations as ageSummary (current filtered rows dated on or before asOf), so the last point equals ageSummary. Each configuration replays its successful image-bearing submissions up to its current row date, with an older seed before the window. Missing p90 is null; no future observations are backfilled. All image filters apply. This is submission age, not container build age.',
    'true 或 false（默认）。返回截至 asOf 的 90 个 UTC 日期点，包含最近秩法计算的 p90AgeDays 和 configurationCount。统计的配置与 ageSummary 相同，即当前筛选结果中日期不晚于 asOf 的行，因此最后一个点与 ageSummary 一致。每个配置的历史由其带镜像的成功提交重建，截至当前行的日期，并保留窗口开始前的最近一次记录。无数据时 p90 为 null，不用未来记录向前回填。所有镜像筛选条件均适用。此指标是提交年龄，不是镜像构建年龄。',
  ],
  runs: [
    'Ordered comma-separated run IDs, at most eight. Omit for newest measured run; empty value selects none.',
    '按顺序排列的运行 ID，以逗号分隔，最多八个。省略时选择最新有实测数据的运行；空值表示不选。',
  ],
  version: [
    'CollectiveX dataset schema version; default 1.',
    'CollectiveX 数据集 schema 版本，默认 1。',
  ],
  suite: ['Run-list filter: all, ep, kv or swap.', '运行列表筛选：all、ep、kv 或 swap。'],
  epSize: [
    'EP size, default 8 when available, otherwise the first available size.',
    'EP 大小，有 8 时默认选 8，否则选首个可用值。',
  ],
  phase: [
    'CollectiveX phase, default decode; video phase: measurement, startup or warmup.',
    'CollectiveX 阶段，默认 decode；视频阶段为 measurement、startup 或 warmup。',
  ],
  modes: [
    'Comma-separated EP mode keys, default every available mode.',
    '以逗号分隔的 EP 模式键，默认选择全部可用模式。',
  ],
  precision: [
    'Precision key; CollectiveX defaults to fp8 if available. The image view trims whitespace, ignores case and defaults to all.',
    '精度键；CollectiveX 有 fp8 时默认使用 fp8。镜像视图去除首尾空白、不区分大小写，默认 all。',
  ],
  operation: [
    'EP operation: roundtrip (default), dispatch or combine.',
    'EP 操作：roundtrip（默认）、dispatch 或 combine。',
  ],
  yAxis: [
    'CollectiveX: latency, tokens-per-second, activation-rate or payload-rate. Video: dollar, clipsGpu, secondsGpu, clipsAllocatedGpu, secondsAllocatedGpu or energy.',
    'CollectiveX 支持 latency、tokens-per-second、activation-rate、payload-rate；视频支持 dollar、clipsGpu、secondsGpu、clipsAllocatedGpu、secondsAllocatedGpu、energy。',
  ],
  activeSeries: [
    'Comma-separated run-namespaced EP series IDs. Omit for all.',
    '以逗号分隔、带运行命名空间的 EP 曲线 ID。省略时选择全部。',
  ],
  kvSeries: [
    'Comma-separated run:case IDs for KV series. Omit for all.',
    '以逗号分隔的 KV run:case ID。省略时选择全部。',
  ],
  swapSeries: [
    'Comma-separated swap series IDs. Omit for all.',
    '以逗号分隔的 swap 曲线 ID。省略时选择全部。',
  ],
  kvX: [
    'KV projection: isl (default), batch, frontier or overlap.',
    'KV 展示方式：isl（默认）、batch、frontier 或 overlap。',
  ],
  kvY: ['KV metric: bandwidth (default) or latency.', 'KV 指标：bandwidth（默认）或 latency。'],
  kvOp: ['KV operation: pull (default) or push.', 'KV 操作：pull（默认）或 push。'],
  pageTokens: [
    'Positive KV page size in tokens; default first available size.',
    'KV 页大小，单位 token，必须为正数；默认首个可用值。',
  ],
  overlapIsl: [
    'Overlap input length: max (default) or a positive integer.',
    '重叠测试输入长度：max（默认）或正整数。',
  ],
  swapDirection: ['h2d (default), d2h or d2d.', 'h2d（默认）、d2h 或 d2d。'],
  swapLayout: ['contiguous (default) or random.', 'contiguous（默认）或 random。'],
  swapMetric: ['bandwidth (default) or latency.', 'bandwidth（默认）或 latency。'],
  swapPercentile: ['p50 (default), p95 or p99.', 'p50（默认）、p95 或 p99。'],
  operator: [
    'gemm, attention_mha, attention_mla or moe_gemm; default first available operator.',
    'gemm、attention_mha、attention_mla 或 moe_gemm；默认首个可用算子。',
  ],
  shape: [
    'Exact OperatorX shape key from response options.',
    '响应 options 中的 OperatorX 形状键。',
  ],
  backend: ['Backend filter; omit for all.', '后端筛选；省略时选择全部。'],
  cluster: ['OperatorX cluster filter; omit for all.', 'OperatorX 集群筛选；省略时选择全部。'],
  sku: ['CollectiveX chip SKU filter; default all.', 'CollectiveX 芯片 SKU 筛选，默认 all。'],
  status: [
    'OperatorX status: ok (default), unsupported, error, missing or all.',
    'OperatorX 状态：ok（默认）、unsupported、error、missing 或 all。',
  ],
  page: [
    'OperatorX zero-based table page; video one-based CI discovery page (view=discovery). Video dashboard/compare read at most the first five published history pages.',
    'OperatorX 表格页码从 0 开始；视频 CI 发现页码从 1 开始（view=discovery）。视频 dashboard/compare 最多读取前五页已发布历史。',
  ],
  metric: [
    'View-specific metric key. OperatorX: tflops or latency; GPU metrics: power, temperature, clocks, utilization or available AMD metrics.',
    '各视图对应的指标键。OperatorX 支持 tflops、latency；GPU 指标支持功耗、温度、时钟、利用率及可用 AMD 指标。',
  ],
  artifact: [
    'GPU metric artifact name, or <artifact>/<file> for multi-file artifacts, as returned in artifacts[]. For video, a numeric artifact ID paired with run.',
    'GPU 指标使用 artifacts[] 返回的产物名称；一个产物含多个文件时，格式为 <artifact>/<file>。视频使用数字产物 ID，需配合 run。',
  ],
  chartView: [
    'chart (default) or correlation. Both return unsampled source rows.',
    'chart（默认）或 correlation，两者均返回未降采样来源行。',
  ],
  corrXMetric: [
    'Correlation x-axis GPU metric, default power.',
    '相关性图 x 轴 GPU 指标，默认 power。',
  ],
  corrYMetric: [
    'Correlation y-axis GPU metric. Defaults to temperature when the artifact sampled it, otherwise to the first collected metric other than corrXMetric; without one the correlation is empty. An explicit metric is used even when unsampled, giving an empty correlation.',
    '相关性图 y 轴 GPU 指标。默认 temperature；若该产物未采集温度，则改用 corrXMetric 以外第一个已采集的指标，没有此类指标时相关性数据为空。显式指定的指标即使未采集也照常使用，此时相关性数据为空。',
  ],
  downsample: [
    'Boolean, default true; sets the renderer hint maxInteractivePoints to 2000, or null when false. Returned raw rows and statistics are never sampled.',
    '布尔值，默认 true；将渲染提示 maxInteractivePoints 设为 2000，false 时为 null。返回的原始行和统计量不降采样。',
  ],
  sort: [
    'Table sort column; submissions defaults to date, GPU statistics to gpuIndex.',
    '表格排序列；提交记录默认 date，GPU 统计默认 gpuIndex。',
  ],
  direction: [
    'asc or desc. Defaults: submissions desc, GPU statistics asc.',
    'asc 或 desc。提交记录默认 desc，GPU 统计默认 asc。',
  ],
  search: [
    'Case-insensitive submission search over chip, model, framework, precision, speculation and vendor.',
    '提交记录搜索，不区分大小写，覆盖芯片、模型、框架、精度、投机解码及厂商。',
  ],
  limit: [
    'Submission table row limit, default 100, maximum 10000.',
    '提交表格行数上限，默认 100，最大 10000。',
  ],
  offset: ['Submission table offset, default 0.', '提交表格偏移量，默认 0。'],
  mode: [
    'Submissions: weekly (default) or cumulative. Calculator modes use interactivity_to_throughput or throughput_to_interactivity.',
    '提交图支持 weekly（默认）、cumulative；计算器支持 interactivity_to_throughput、throughput_to_interactivity。',
  ],
  onChangeOnly: [
    'Boolean, default true. For weekly charts only, apply the dashboard on-change reporting cutoff.',
    '布尔值，默认 true。仅周图按仪表板规则应用按变更运行的统计起点。',
  ],
  lines: [
    'Submission chart lines: comma-separated nvidia, amd, total; amd includes non-NVIDIA rows as in the UI.',
    '提交图曲线：nvidia、amd、total，以逗号分隔；amd 与界面一致，包含非 NVIDIA 行。',
  ],
  hardware: [
    'Image-view hardware key; whitespace is trimmed and case ignored. Default all.',
    '镜像视图硬件键，去除首尾空白、不区分大小写，默认 all。',
  ],
  nodeType: [
    'Image deployment: all (default), single or disagg.',
    '镜像部署类型：all（默认）、single 或 disagg。',
  ],
  frameworks: [
    'Comma-separated framework-family keys; omitted selection includes all.',
    '以逗号分隔的框架系列键；省略时选择全部。',
  ],
  spec: [
    'Speculative decoding filter; the image view trims whitespace and ignores case for a single value, default all. Inference uses a comma-separated list.',
    '投机解码筛选；镜像视图使用单个值，去除首尾空白、不区分大小写，默认 all。推理视图使用逗号分隔列表。',
  ],
  run: [
    'Public video CI run ID; retains legacy run/artifact selection. Omit for the dashboard, or use view=discovery to list runs.',
    '公开视频 CI 运行 ID；保留原有运行/产物选择方式。省略时读取仪表板；使用 view=discovery 列出运行。',
  ],
  compare: [
    'Video: up to eight comma-separated run:artifact pairs of already published evidence.',
    '视频：最多八组已发布证据的 run:artifact，以逗号分隔。',
  ],
  source: [
    'Published video source ID; defaults to first source.',
    '已发布视频来源 ID，默认首个来源。',
  ],
  cell: [
    'Serving cell ID. Unknown IDs fall back to the first cell, matching the UI; evidence.cell records the resolved choice.',
    'serving cell ID。未知 ID 与界面一致，回退到首个 cell；evidence.cell 记录解析后的选择。',
  ],
  slot: [
    'Media/fidelity slot ID. Unknown IDs fall back to the UI default; evidence.slot records the resolved choice.',
    '媒体或保真度 slot ID。未知 ID 回退到界面默认值；evidence.slot 记录解析后的选择。',
  ],
  gpuBasis: [
    'Video denominator: participating (default) or allocated GPUs.',
    '视频分母：participating（默认）或 allocated GPU。',
  ],
  workload: [
    'Exact workload-group key from video workloads. Comparisons never pool unequal workloads.',
    '视频 workloads 中的工作负载分组键。不同工作负载不合并比较。',
  ],
  xAxis: [
    'Video latency: p90 or median. Serving defaults to median only when p90 is unavailable.',
    '视频延迟：p90 或 median。serving 仅在 p90 不可用时默认 median。',
  ],
  selected: ['Selected video tradeoff point ID.', '选中的视频权衡图数据点 ID。'],
  costs: [
    'JSON object mapping video point IDs to {hourly,source,date} strings; hourly is nonnegative USD/deployment-hour.',
    'JSON 对象，将视频数据点 ID 映射为 {hourly,source,date} 字符串；hourly 为非负 USD/deployment-hour。',
  ],
  gpu: [
    'Accelerator key, e.g. "H100 SXM", "Huawei 950PR", "B200 SXM" or "Ascend 950PR_9579". core-memory-profiles and tpc-skyline default to "all"; other tests default to the first available device. "all" returns all devices; unavailable tests retain an empty gpus array for an explicitly selected device.',
    '加速器键，如 "H100 SXM"、"Huawei 950PR"、"B200 SXM" 或 "Ascend 950PR_9579"。core-memory-profiles 和 tpc-skyline 默认 "all"，其他测试默认首个可用设备。"all" 返回全部设备；显式选择设备时，没有数据的测试保留空 gpus 数组。',
  ],
  test: [
    'ubenchX test selector: mem-bw, sm-l2-distance, tpc-skyline, core-memory-profiles, or all (default). Determines which benchmark data is returned.',
    'ubenchX 测试选择：mem-bw、sm-l2-distance、tpc-skyline、core-memory-profiles 或 all（默认），决定返回哪种基准测试数据。',
  ],
  view: [
    'Video overview (nine groups, r_* selectors), dashboard (default without run/artifact), compare (published matched cases), or legacy discovery/results/tradeoff. run/artifact defaults to results. Selector families cannot be mixed.',
    '视频 overview（九组指标，使用 r_* 参数）、dashboard（未指定 run/artifact 时默认）、compare（已发布匹配用例），或原有 discovery/results/tradeoff。指定 run/artifact 时默认 results。不同视图的参数不能混用。',
  ],
  r_model: [
    'Exact model identifier; omitted selects the best-covered eligible workload.',
    '完整模型标识；未指定时选择硬件覆盖最多的合格工作负载。',
  ],
  r_workload: [
    'Compact key from options.workloads; resolves to the complete canonical workloadKey internally. One shared 20-scheduled-clip C1 spec with at least 10 valid samples per hardware.',
    'options.workloads 中的短 key，内部解析为完整 canonical workloadKey。所有硬件共用计划 20 条视频的 C1 spec，每种硬件至少 10 个有效样本。',
  ],
  r_resolution: [
    'Exact width×height from the sealed plan, such as 1344×768.',
    '封印计划中的完整宽×高，例如 1344×768。',
  ],
  r_duration: ['Positive planned clip duration in seconds.', '计划视频时长，单位秒，必须为正数。'],
  r_mode: [
    'Explicit generation mode; unknown modes are never inferred from model names.',
    '明确记录的生成模式；不从模型名称推断缺失模式。',
  ],
  r_steps: ['Recorded denoising step count.', '记录的去噪步数。'],
  r_gpus: [
    'Participating GPU count. deploymentCells retains the pre-filter GPU-count series.',
    '参与计算的 GPU 数。deploymentCells 保留应用此筛选前的数据，供按 GPU 数作图。',
  ],
  r_engine: [
    'Recorded engine name, separate from runtime revision.',
    '记录的引擎名称，与 runtime revision 分开。',
  ],
  r_date: [
    'Recorded execution date, YYYY-MM-DD; never publication date.',
    '记录的执行日期，格式 YYYY-MM-DD；不以发布日期替代。',
  ],
  r_hidden: [
    'Comma-separated hardware keys hidden from all overview groups and clips.',
    '以逗号分隔的隐藏硬件键，作用于全部概览指标组和视频。',
  ],
  r_deadline: [
    'Delivery deadline seconds, default 120. Attainment divides on-time valid clips by valid clips; goodput divides by measured wall time.',
    '交付 deadline，单位秒，默认 120。达标率为按时交付的有效视频占比；goodput 为按时交付的有效视频数除以测量窗口时长。',
  ],
  r_tier: [
    'Hardware registry TCO tier h (owning, default) or r (renting). Both GPU cost bases are returned.',
    '硬件注册表 TCO 档位 h（自有，默认）或 r（租赁），同时返回两种 GPU 成本口径。',
  ],
  r_api: [
    'Optional nonnegative USD/video-second scenario price when generation mode is unknown; default null.',
    '生成模式未记录时可指定的非负视频秒场景价格，单位美元；默认 null。',
  ],
  r_price_t2v: [
    'Optional nonnegative T2V scenario price, USD/video-second; default null.',
    '可选非负 T2V 视频秒场景价格，单位美元；默认 null。',
  ],
  r_price_i2v: [
    'Optional nonnegative I2V scenario price, USD/video-second; default null.',
    '可选非负 I2V 视频秒场景价格，单位美元；默认 null。',
  ],
  r_price_r2v: [
    'Optional nonnegative R2V scenario price, USD/video-second; default null.',
    '可选非负 R2V 视频秒场景价格，单位美元；默认 null。',
  ],
  r_utilization: [
    'Modelled utilization 0–1, default 1. Revenue scales; reserved GPU hourly cost does not.',
    '估算利用率，范围 0–1，默认 1。收入随利用率变化，预留 GPU 每小时成本不变。',
  ],
  v_x: [
    'Dashboard X metric: p90Latency (default) or p50Latency, in seconds. Invalid values use the UI default.',
    '仪表板 X 轴指标：p90Latency（默认）或 p50Latency，单位秒。无效值按界面默认值处理。',
  ],
  v_y: [
    'Dashboard Y metric: videosPerDollar (default), dollarsPerVideo, videosPerGpuHour or kjPerVideo. Invalid values use the UI default.',
    '仪表板 Y 轴指标：videosPerDollar（默认）、dollarsPerVideo、videosPerGpuHour 或 kjPerVideo。无效值按界面默认值处理。',
  ],
  v_tier: [
    'TCO cost tier: h (owning, default) or r (renting), from the same hardware registry as the dashboard; invalid values use h.',
    'TCO 成本档位：h（自有，默认）或 r（租赁），使用与仪表板相同的硬件成本表；无效值使用 h。',
  ],
  v_view: [
    'chart (default) or table; presentation-only preference, echoed as params.displayView without changing returned datasets.',
    'chart（默认）或 table；仅影响展示，在 params.displayView 中返回，不改变数据集。',
  ],
  v_optimal: [
    'Per-hardware Pareto deployments only unless exactly 0. Changes chart/table rows; queued cells never enter either.',
    '除值恰为 0 外，仅保留每种硬件的 Pareto 部署。作用于图表和表格；排队 cell 始终不进入这两者。',
  ],
  v_api: [
    'Positive USD/video-second API list-price reference, rounded to four decimals; invalid values use the dated UI reference. Multiplies clip duration only, not TCO or chart efficiency.',
    '正数 API 视频秒参考价，单位 USD/video-second，四舍五入至四位小数；无效值回退至界面带日期的参考价。仅用于乘以视频时长，不影响 TCO 或图表效率。',
  ],
  v_hidden: [
    'Comma-separated hidden hardware keys from the video roster; default empty, deduplicated and sorted, unknown keys ignored. Filters chart/table only, not KPI/Compare/Evidence.',
    '以逗号分隔的隐藏硬件键，仅接受视频硬件列表中的键；默认空，排序去重，忽略未知键。只筛选图表和表格，不改变 KPI、Compare 或 Evidence。',
  ],
  v_base: [
    'Baseline hardware key; unavailable/invalid selection resolves to the UI default (slowest eligible lead deployment). The two sides stay distinct: a side that would match the other moves to the other default.',
    '基线硬件键；无效或无可用测量时回退到界面默认值（符合条件的代表部署中最慢的一种）。两侧始终为不同硬件：若一侧与另一侧相同，则改用另一侧的默认值。',
  ],
  v_cand: [
    'Candidate hardware key; unavailable/invalid selection resolves to the UI default (fastest eligible lead deployment). The two sides stay distinct: a side that would match the other moves to the other default.',
    '候选硬件键；无效或无可用测量时回退到界面默认值（符合条件的代表部署中最快的一种）。两侧始终为不同硬件：若一侧与另一侧相同，则改用另一侧的默认值。',
  ],
  v_case: [
    'Zero-based matched-case index, 0–9999 (default 0). view=compare clamps it to the available pairs and returns cases.resolvedCaseIndex; dashboard leaves media not-requested.',
    '匹配用例索引从零开始，范围 0–9999（默认 0）。view=compare 按可用配对范围收敛，并在 cases.resolvedCaseIndex 返回实际索引；dashboard 不加载媒体。',
  ],
};

export function viewParameter(view: ReadonlyView, name: string): ApiParameter {
  const note: readonly [string, string] =
    view === 'video' && (name === 'unofficialrun' || name === 'unofficialruns')
      ? [
          'Single stored run ID (unofficialrun or canonical unofficialruns alias; multiple IDs and both aliases together return 400) for separate overview overlayCells, whether approved or unapproved. Actual approval is preserved; the selected run is excluded from official cells. Unknown or ineligible runs return no overlay. No publication is triggered.',
          '单个已存储运行 ID，可用 unofficialrun 或分享链接的 unofficialruns 别名；多个 ID 或同时使用两个别名返回 400。所选运行无论是否已批准，都只放入 overview 中独立的 overlayCells，保留实际批准状态，并从正式结果中排除；未知或未达准入要求的运行不返回叠加结果。该参数不会触发发布。',
        ]
      : view === 'current-inferencex-image' && name === 'sequence'
        ? ([
            'Image scenario. Defaults to agentic-traces (Agentic), falling back to the first available active scenario for the selected model.',
            '镜像场景。默认为 agentic-traces（Agentic）；所选模型无此场景时，回退到其首个有效场景。',
          ] as const)
        : (view === 'profit-estimator' || view === 'profit-estimator-per-gigawatt') &&
            name === 'model'
          ? ([
              'Model display name or comparison slug. The dashboards offer agentic-trace models with usable benchmark curves and token pricing; this API also accepts other known models, which may return no estimated rows. Check /api/v1/availability for agentic_traces data.',
              '模型显示名称或比较页 slug。仪表板提供具有可用 AgentX 测试曲线和 token 定价的模型；本 API 也接受其他已知模型，但可能返回空的估算结果。可通过 /api/v1/availability 查询 agentic_traces 数据。',
            ] as const)
          : (PARAMETER_NOTES[name] ?? [
              `${name} selector for ${view}; resolved value is returned in params.`,
              `${view} 的 ${name} 选择项；解析后的值在 params 中返回。`,
            ]);
  return {
    name,
    location: 'query',
    required:
      (name === 'model' &&
        !['current-inferencex-image', 'overview', 'rankings', 'compare'].includes(view)) ||
      (view === 'gpu-metrics' && name === 'runId'),
    type: 'string',
    schema: { type: 'string' },
    description: text(...note),
    example: name === 'model' ? 'DeepSeek-V4-Pro' : name === 'runId' ? '123' : '',
  };
}

const NEW_VIEWS = {
  'first-token': ['First-token winners', '首 token 达标配置', { data: object }],
  'cache-reuse': [
    'Cache-reuse curves',
    '缓存复用曲线',
    {
      configurations: object,
      data: {
        type: ['object', 'null'],
        additionalProperties: true,
        properties: {
          recipe: { type: ['string', 'null'] },
          recipes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                rows: { type: 'integer' },
                tiered: { type: 'integer' },
              },
              required: ['key', 'label', 'rows', 'tiered'],
            },
          },
        },
      },
    },
  ],
  'profit-estimator': [
    'Profit per chip-hour',
    '每芯片小时利润',
    { pricing: object, data: object, overlays: object, comparisons: objects },
  ],
  'profit-estimator-per-gigawatt': [
    'Profit per gigawatt-year',
    '每吉瓦年利润',
    { pricing: object, data: object, overlays: object, comparisons: objects },
  ],
  collectivex: [
    'CollectiveX EP, KV and swap views',
    'CollectiveX EP、KV 与 swap 视图',
    {
      runs: objects,
      ep: object,
      kv: object,
      swap: object,
      options: object,
      knownSupport: object,
      knownSupportFootnotes: object,
    },
  ],
  submissions: [
    'Submission table and weekly volume',
    '提交表格与每周数量',
    { rows: objects, stats: object, series: objects },
  ],
  'current-inferencex-image': [
    'Current serving images',
    '当前推理镜像',
    {
      rows: objects,
      options: object,
      releases: object,
      ageSummary: imageAgePoint,
      ageHistory: { type: 'array', items: imageAgePoint },
      ageMethodology: object,
    },
  ],
  'gpu-metrics': [
    'GPU telemetry and full-record statistics',
    'GPU 遥测与全记录统计',
    {
      runInfo: object,
      artifacts: strings,
      coverage: {
        type: ['object', 'null'],
        properties: {
          status: { type: 'string', enum: ['complete', 'partial', 'unknown'] },
          missingArtifacts: strings,
        },
        required: ['status', 'missingArtifacts'],
        additionalProperties: false,
      },
      rows: objects,
      stats: {
        ...objects,
        description:
          'Per-GPU statistics for the selected file/host series, including startup and warmup. For stored runs they are computed on each read from the stored samples: a missing reading stays missing, and a series whose stored samples do not match its recorded sample count returns no statistics. Count is the finite-reading count after first-wins timestamp/GPU deduplication. Mean is sample-weighted, P50/P95/P99 use linear interpolation at p*(N-1), and standard deviation divides by N. Values use the selected metric unit; rows carry no metric field, since params.metric identifies it. GPU visibility and chart downsampling do not change this population. These are not serving-window power or J/token.',
      },
      rendering: object,
    },
  ],
  video: [
    'VideoGenX dashboard and published comparison evidence',
    'VideoGenX 仪表板与已发布对比证据',
    {
      cells: objects,
      deploymentCells: objects,
      workloadMix: objects,
      overlayCells: objects,
      options: object,
      state: object,
      workloadKey: { type: ['string', 'null'] },
      excludedCount: { type: 'integer', minimum: 0 },
      sampleFloor: { type: 'integer', const: 10 },
      scheduledClips: { type: 'integer', const: 20 },
      roster: strings,
      metricDefinitions: object,
      plot: object,
      rows: objects,
      kpis: objects,
      comparison: object,
      provenance: objects,
      workload: { type: ['string', 'null'] },
      otherWorkloads: { type: 'integer', minimum: 0 },
      coverage: {
        type: 'object',
        properties: {
          pagesRead: { type: 'integer', minimum: 1, maximum: VIDEO_HISTORY_MAX_PAGES },
          maxPages: { type: 'integer', enum: [VIDEO_HISTORY_MAX_PAGES] },
          nextPage: { type: ['integer', 'null'] },
          truncated: { type: 'boolean' },
        },
        required: ['pagesRead', 'maxPages', 'nextPage', 'truncated'],
      },
      sources: objects,
      points: objects,
      curves: object,
      evidence: { type: ['object', 'null'], additionalProperties: true },
      discovery: object,
    },
  ],
  ubenchx: [
    'ubenchX microbenchmarks with per-device protocols and bandwidth references (mem-bw, sm-l2-distance, tpc-skyline, and core-memory-profiles)',
    'ubenchX 微基准测试及各设备的测试协议和带宽参考值（mem-bw、sm-l2-distance、tpc-skyline 和 core-memory-profiles）',
    {
      gpus: objects,
      tests: strings,
      memBw: object,
      smL2Distance: object,
      tpcSkyline: object,
      skuConfigurations: objects,
      coreMemoryProfiles: object,
    },
  ],
} as const;

const RESULTS_OVERVIEW_NOTES = {
  en: 'view=overview shares resultProjection with the nine-group UI, admits one canonical 20-clip C1 workload with ten valid samples per hardware, and returns measured metrics plus separately labelled participating/allocated cost and modelled profit. Missing allocation remains null. Default points require publication approval. unofficialrun selects only the exact stored run into overlayCells with its actual approval, excluding it from official cells, deployments and workload mix. Approved cohorts retain default preference; named-only workloads require explicit selection or no matching approved cohort. Clearing never promotes unapproved evidence. The overview is JSON-only; format=csv returns 400. Missing quality, stage timing, memory and startup evidence stays null. Play/pause, scrub, difference rendering, theme and expand controls are presentation-only; media uses the published-only read path. ',
  zh: 'view=overview 与九组指标界面共用 resultProjection，只准入同一份计划 20 条视频的 C1 工作负载，各硬件统一至少 10 个有效样本。响应包含实测指标及分别标注的参与/已分配 GPU 成本和估算利润；分配证据缺失时保留 null。默认数据点须有发布批准。unofficialrun 只把指定的已存储运行放入 overlayCells，保留其实际批准状态，并将其排除在正式结果、部署和工作负载构成之外。默认优先选择有已批准结果的工作负载；仅由指定运行提供的工作负载须明确选择，或在没有匹配的已批准结果时作为回退。清除叠加运行后也不会把未批准数据转为正式结果。overview 仅返回 JSON，format=csv 返回 400。质量、阶段计时、内存和启动证据缺失时保留 null。播放、拖动、差异显示、主题和展开控件只影响展示；媒体使用只读已发布路径。',
};

export const operations: ApiOperation[] = Object.entries(NEW_VIEWS).map(
  ([key, [en, zh, fields]]) => {
    const view = key as keyof typeof NEW_VIEWS;
    return {
      id: `get-${view}-view`,
      group: 'views',
      method: 'GET',
      path: `/api/v1/views/${view}`,
      summary: text(en, zh),
      description: text(
        `${view === 'video' ? RESULTS_OVERVIEW_NOTES.en : ''}Read-only ${en.toLowerCase()} using the dashboard's source handlers and calculation helpers. Unknown and repeated query keys return 400. The response includes resolved params and preserves missing evidence. Renderer-only styling is not an API parameter.${view === 'ubenchx' ? ' tpc-skyline also returns skuConfigurations separately from measured NVIDIA gpus. gpu=all (default) or Huawei 950PR includes all nine supplied 950PR configurations; an exact Ascend 950PR_<suffix> selects one. Rows preserve Cube/Vector/AICPU counts, MHz clocks, GiB memory, MiB L2, virtualisationOptions and raw ddrRate values with unit=null. Source metadata links the supplied screenshot and marks vendorSourceVerified=false; these are not topology measurements. test=all includes the same array inside tpcSkyline, honoring explicit gpu filters. core-memory-profiles defaults to gpu=all and returns Ascend 950PR_9579 first, followed by B200 SXM; gpu selects either device. B200 retains orderedSms, smInfo, gpcBounds, matrix, stats and metadata, with unit=clock64 cycles and its own colorLimits. The legacy sm-l2-distance API remains available with its original shape. Ascend returns panels with actual coreIds, dieGroups, full matrices, raw SYS_CNT tick units and unique-pair within/between-group statistics; a missing pair class is null. Shared colorLimits and limitations preserve the interpretation. These are profile differences, not core-to-core latency or a floorplan. mem-bw includes Huawei rotating-pool FP16 graph results. timeMs is amortized per copy for metadata.protocol=rotating-pool-npu-graph. peakBandwidthSource documents the per-run normalization reference; optional rows retain observations, bandwidthP10Gbps, bandwidthP90Gbps, processBandwidthGbps, slots and combinedPoolBytes. Missing sizes are listed in metadata.missingSizesBytes.' : ''}${
          view === 'video'
            ? ' Default dashboard mode reuses published history → videoPoints → dashboardCells → metrics/plot/compare/evidence. It reads at most the same first five history pages as the UI, reports coverage/truncation, selects one canonical workload and keeps the shared sample floor. v_hidden affects chart/table only. view=compare additionally reads at most two already-published media artifacts, pairs cases with the UI helper and returns relative media paths without asset URLs; missing/failed media remains explicit. run/artifact or explicit discovery/results/tradeoff preserve the legacy contract. Discovery includes standard run-sweep runs; these may have no video artifacts. Run artifact listings cover all GitHub pages and retain legacy and unique native matrix names. Allocated GPU counts require retained scheduler allocation evidence; native power device counts cannot substitute for it. Missing allocation and allocation-normalized metrics remain null. No date range, full-catalog completeness, power/quality qualification or causal bottleneck claim is implied. Local bundles and arbitrary URLs are excluded. Responses are no-store.'
            : view === 'current-inferencex-image'
              ? " ageSummary is the nearest-rank p90 of current filtered row submission ages at asOf (future-dated rows excluded). includeHistory=true adds 90 daily ageHistory points reconstructed from the successful image-bearing submissions of those same configurations, so the last point equals ageSummary. Configurations absent from the current table, such as speculation or node-type variants replaced by a newer run, are excluded. Each displayed configuration has one vote; repeated submissions reset its age even if the image tag is unchanged. Neither metric measures container build age. A row is outdated when its tag version is below the base engine's latest vLLM or SGLang release. A nightly whose commit GitHub resolves is outdated only when that commit is an ancestor of the release. Other nightlies compare their build date with the release's publish date: the tag's date, else the build's earliest submission in the catalog. Other tags, and engines without a release stream, are not flagged."
              : view === 'gpu-metrics'
                ? ' Telemetry comes from one source per run: its stored DB series once the run is ingested, otherwise its GitHub artifacts. Stored coverage describes the entire run: complete means the recorded artifact/file inventory is present, partial means recorded telemetry is missing, and unknown means no complete inventory was retained; missingArtifacts names entirely missing artifacts and may be empty when only a file is incomplete. GitHub coverage is null (unassessed). Responses use private, no-store; an upstream database failure remains HTTP 503 rather than an empty dataset. File/host series retain separate identities. Raw rows and charts respect selected GPU indices. Statistics cover every chip of the selected file/host series, including startup and warmup, and are computed from its samples on each read; a stored series whose samples do not match its recorded sample count returns none. Mean is sample-weighted, P50/P95/P99 interpolate linearly at p*(N-1), and standard deviation divides by N. These statistics are not serving-window power or J/token. Line time remains relative to the first sample across all chips; missing metric readings are omitted rather than zero-filled. Correlations require both readings. This endpoint projects the raw GPU-metrics explorer, not the inference Power Timeline. Timeline role/window evidence comes from its existing series=power read plus benchmark power_audit. Timeline i_ptaxis, i_ptlines, i_ptwindow, i_ptfocus, i_ptutility and i_ptconc share fields control client rendering only and are not accepted here; they do not change raw telemetry or full-record statistics.'
                : ''
        }`,
        `${view === 'video' ? RESULTS_OVERVIEW_NOTES.zh : ''}只读${zh}，使用仪表板的数据读取和计算函数。未知或重复查询键返回 400；响应包含解析后的参数，保留缺失数据。仅影响样式的控件不作为 API 参数。${view === 'ubenchx' ? ' tpc-skyline 另外返回 skuConfigurations，与 NVIDIA 实测的 gpus 分开列出。gpu=all（默认）或 Huawei 950PR 时返回所提供的全部九种 950PR 配置；指定完整的 Ascend 950PR_<suffix> 时只返回该 SKU。每行保留 Cube/Vector/AICPU 数量、频率（MHz）、内存（GiB）、L2（MiB）、virtualisationOptions，以及原始 ddrRate 数值（unit=null）。来源元数据链接到所提供的截图，并标记 vendorSourceVerified=false；这些配置数据不是拓扑实测结果。test=all 时，tpcSkyline 中返回同一数组，并遵循显式指定的 gpu 筛选。 core-memory-profiles 默认 gpu=all，先返回 Ascend 950PR_9579，再返回 B200 SXM；gpu 可单独选择设备。B200 保留 orderedSms、smInfo、gpcBounds、matrix、stats 和 metadata，单位为 clock64 cycles，使用独立 colorLimits。旧版 sm-l2-distance API 仍可使用，响应结构不变。Ascend 返回各面板的实际 coreIds、dieGroups、完整矩阵、原始 SYS_CNT tick 单位及去重核心对的组内和组间统计；没有对应核心对时为 null。colorLimits 和 limitations 保留统一色标及解释限制。这些数据是访存特征差异，不是核心间通信延迟或物理布局图。 mem-bw 包含 Huawei FP16 轮转缓冲池图执行结果。metadata.protocol=rotating-pool-npu-graph 时，timeMs 为每次拷贝的摊销时间。peakBandwidthSource 说明该次测量采用的归一化参考值；行数据可保留 observations、bandwidthP10Gbps、bandwidthP90Gbps、processBandwidthGbps、slots 和 combinedPoolBytes。缺失大小列在 metadata.missingSizesBytes。' : ''}${
          view === 'video'
            ? ' 默认 dashboard 模式复用已发布历史 → videoPoints → dashboardCells → metrics/plot/compare/evidence。与界面一样最多读取前五页历史，返回覆盖范围和截断状态，选择一个 canonical workload 并应用相同样本门槛。v_hidden 只影响图表和表格。view=compare 额外读取最多两份已发布媒体产物，复用界面配对函数，仅返回相对媒体路径，不返回 asset URL；媒体缺失或读取失败会明确标记。run/artifact 或显式 discovery/results/tradeoff 保留原有契约。发现列表包括标准 run-sweep 运行，其中可能没有视频产物。单次运行的产物列表读取 GitHub 全部分页，兼容旧名称和原生矩阵的唯一名称。已分配 GPU 数须有保留的调度器分配证据，原生功率设备数不能替代；缺失的分配数量及按其归一化的指标保持 null。不代表日期区间、完整历史、功率/质量验收或瓶颈因果判断。不读取本地数据包或任意 URL。响应不缓存。'
            : view === 'current-inferencex-image'
              ? ' ageSummary 按最近秩法计算当前筛选行在 asOf 的提交年龄 P90（排除未来日期行）。includeHistory=true 基于同一批配置的带镜像成功提交，重建 90 个每日 ageHistory 点，因此最后一个点与 ageSummary 一致。当前表格中没有的配置（例如已被更新 run 取代的投机解码或节点类型变体）不计入。每个展示配置计一次；即使镜像标签未变，重新提交仍会重置年龄。两项指标均不代表镜像构建年龄。镜像标签中的版本号低于对应基础引擎（vLLM 或 SGLang）的最新 release 时，该行标记为 outdated。nightly 镜像的 commit 若能在 GitHub 上解析，则仅当该 commit 是此 release 的祖先提交时才标记；其余 nightly 镜像比较构建日期与 release 发布日期，构建日期取标签中的日期，标签无日期时取该构建在镜像目录中最早的提交日期。其他标签以及没有 release 来源的引擎不作标记。'
              : view === 'gpu-metrics'
                ? ' 每个 run 只从一个来源读取遥测：已入库的 run 读取数据库中存储的序列，其余 run 读取 GitHub 产物。数据库 coverage 描述整个 run：complete 表示记录的产物与文件清单均已入库，partial 表示部分已记录的遥测缺失，unknown 表示未保留完整清单；missingArtifacts 仅列出整体缺失的产物；若只是文件不完整，此列表可能为空。GitHub 数据的 coverage 为 null，表示尚未评估。响应使用 private, no-store；上游数据库故障保留 HTTP 503，不作为空数据返回。各文件、主机的序列身份独立保留。原始数据行和图表按所选 GPU 索引筛选。统计则覆盖所选文件或主机序列的全部 GPU，包含启动阶段和 warmup，每次读取时由该序列的样本计算；若已存序列读取到的样本数与记录不符，则不返回统计。均值按样本加权，P50/P95/P99 在 p*(N-1) 处线性插值，标准差以 N 为分母。这些统计不是 serving-window 功率或 J/token。折线时间以所有 GPU 的首个采样为起点；缺失指标读数会被跳过，不补零。相关性图要求两个指标均有读数。本接口投影原始 GPU-metrics 浏览器，不是推理页的 Power Timeline。时间线通过现有 series=power 读取和基准测试 power_audit 获取角色与窗口证据；i_ptaxis、i_ptlines、i_ptwindow、i_ptfocus、i_ptutility 和 i_ptconc 分享字段仅控制客户端显示，本接口不接受这些参数。它们不改变原始遥测或全记录统计。'
                : ''
        }`,
      ),
      audience: 'public',
      stability: 'beta',
      parameters: VIEW_QUERY_PARAMS[view].map((name) => viewParameter(view, name)),
      responses: [
        {
          status: '200',
          description: text(
            'Resolved selection and public view data.',
            '解析后的选择与公开视图数据。',
          ),
          schema: {
            type: 'object',
            properties: {
              view: { type: 'string', enum: [view] },
              apiVersion: { type: 'string', enum: ['v1'] },
              params: object,
              ...fields,
            },
            required: ['view', 'apiVersion', 'params'],
            additionalProperties: true,
          },
          example: { view, apiVersion: 'v1', params: {} },
          mediaType: 'application/json',
        },
        ...(view === 'video'
          ? [
              {
                status: '204',
                description: text(
                  'No published video artifact is available. The response has no body.',
                  '暂无已发布的视频产物，响应不含正文。',
                ),
                schema: { type: 'null' },
                example: null,
              } satisfies ApiResponse,
            ]
          : []),
        ...(['404', '429', '503'] as const).map((status): ApiResponse => ({
          status,
          description: text(
            'Source status is preserved; internal details are removed and failures are not cached.',
            '保留上游状态码，移除内部详情，失败响应不缓存。',
          ),
          schema: object,
          example: { error: 'Source data unavailable' },
          mediaType: 'application/json',
        })),
        {
          status: '400',
          description: text('Invalid or unsupported query.', '查询无效或不受支持。'),
          schema: object,
          example: { error: 'Invalid parameter', param: 'model' },
          mediaType: 'application/json',
        },
        {
          status: '500',
          description: text('Data retrieval or projection failed.', '数据读取或视图计算失败。'),
          schema: object,
          example: { error: 'Internal server error' },
          mediaType: 'application/json',
        },
      ],
      responseShapeName: `${view
        .split('-')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join('')}View`,
      curlUrl: `${API_BASE_URL}/api/v1/views/${view}${view === 'gpu-metrics' ? '?runId=123' : view.includes('profit') || view === 'first-token' || view === 'cache-reuse' ? '?model=DeepSeek-V4-Pro' : ''}`,
    };
  },
);

export function extendViewOperations(baseOperations: readonly ApiOperation[]): ApiOperation[] {
  return baseOperations.map((operation) => {
    const view = operation.path.split('/').at(-1) as ReadonlyView;
    const names = VIEW_QUERY_PARAMS[view];
    return {
      ...operation,
      parameters: names.map(
        (name) => operation.parameters.find((p) => p.name === name) ?? viewParameter(view, name),
      ),
    };
  });
}
