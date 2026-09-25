import type { ApiOperation, ApiParameter, ApiResponse, ApiSchema } from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';
import { text } from '@/lib/api-documentation-helpers';
import { VIEW_QUERY_PARAMS, type ReadonlyView } from '../registry';

const object: ApiSchema = { type: 'object', additionalProperties: true };
const objects: ApiSchema = { type: 'array', items: object };
const strings: ApiSchema = { type: 'array', items: { type: 'string' } };

/** Query values are strings on the wire; resolved params carry typed values. */
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
    'Positive safe integer workflow run ID. Omit to select the default run; required for live GPU metrics.',
    '正安全整数格式的工作流运行 ID。不填时选择默认运行；实时 GPU 指标必须填写。',
  ],
  precisions: [
    'Comma-separated precision keys; omitted selection uses available curve density. Calculator extensions auto-select the densest official precision and include precisions present in unofficial-run overlays.',
    '以逗号分隔的精度键；省略时按可用测试曲线数量选择。计算器扩展视图选择官方数据中曲线最多的精度，并纳入 unofficial-run 叠加数据中的精度。',
  ],
  gpus: [
    'Comma-separated hardware/config keys; for gpu-metrics use numeric GPU indices. Omit for all.',
    '以逗号分隔的硬件或配置键；gpu-metrics 使用数字芯片索引。省略时选择全部。',
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
    'Positive operating-point target, tok/s/user in interactivity-to-throughput mode. Profit defaults are model-specific.',
    '正数工作点目标；交互性转吞吐量模式下单位为 tok/s/user。利润视图按模型设置默认值。',
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
    'provisioned (default), modeled or compare. Modeled power requires eligible measured source rows; estimates extrapolated from partial-GPU measurements to a full chassis are identified by powerLabel. Missing coverage is not zero.',
    'provisioned（默认）、modeled 或 compare。建模功耗需要符合条件的实测数据行；由部分 GPU 的实测数据外推到整机的估算，会通过 powerLabel 标明。缺失数据不按零处理。',
  ],
  power: [
    'Comma-separated certified and/or legacy power tiers. Omit for all tiers.',
    '以逗号分隔的 certified、legacy 功率数据等级。省略时选择全部等级。',
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
    'OperatorX zero-based table page; video one-based CI discovery page.',
    'OperatorX 表格页码从 0 开始；视频 CI 发现页码从 1 开始。',
  ],
  metric: [
    'View-specific metric key. OperatorX: tflops or latency; GPU metrics: power, temperature, clocks, utilization or available AMD metrics.',
    '各视图对应的指标键。OperatorX 支持 tflops、latency；GPU 指标支持功耗、温度、时钟、利用率及可用 AMD 指标。',
  ],
  artifact: [
    'GPU metric artifact name, or video numeric artifact ID paired with run.',
    'GPU 指标产物名称，或配合 run 使用的视频数字产物 ID。',
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
    'Correlation y-axis GPU metric, default temperature.',
    '相关性图 y 轴 GPU 指标，默认 temperature。',
  ],
  downsample: [
    'Boolean, default true; declares the UI 2000-interactive-point rendering cap. Returned raw rows and statistics are never sampled.',
    '布尔值，默认 true，指定界面 2000 个交互点的渲染上限。返回的原始行和统计量不降采样。',
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
    'Image deployment: single (default), disagg or all.',
    '镜像部署类型：single（默认）、disagg 或 all。',
  ],
  frameworks: [
    'Comma-separated framework-family keys; omitted selection includes all.',
    '以逗号分隔的框架系列键；省略时选择全部。',
  ],
  spec: [
    'Speculative decoding filter; the image view trims whitespace and ignores case for a single value, default all. Inference uses a comma-separated list.',
    '投机解码筛选；镜像视图使用单个值，去除首尾空白、不区分大小写，默认 all。推理视图使用逗号分隔列表。',
  ],
  run: ['Public video CI run ID. Omit to discover runs.', '公开视频 CI 运行 ID。省略时列出运行。'],
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
    '与已发布证据一起保留的 serving cell 选择。',
  ],
  slot: [
    'Media/fidelity slot ID. Unknown IDs fall back to the UI default; evidence.slot records the resolved choice.',
    '与已发布证据一起保留的媒体或保真度 slot 选择。',
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
  view: ['Video results (default) or tradeoff.', '视频 results（默认）或 tradeoff。'],
};

export function viewParameter(view: ReadonlyView, name: string): ApiParameter {
  const note = PARAMETER_NOTES[name] ?? [
    `${name} selector for ${view}; resolved value is returned in params.`,
    `${view} 的 ${name} 选择项；解析后的值在 params 中返回。`,
  ];
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
    { configurations: object, data: { type: ['object', 'null'], additionalProperties: true } },
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
    { runs: objects, ep: object, kv: object, swap: object, options: object },
  ],
  submissions: [
    'Submission table and weekly volume',
    '提交表格与每周数量',
    { rows: objects, stats: object, series: objects },
  ],
  'current-inferencex-image': [
    'Current serving images',
    '当前推理镜像',
    { rows: objects, options: object },
  ],
  'gpu-metrics': [
    'Live GPU metrics and statistics',
    '实时 GPU 指标与统计',
    { runInfo: object, artifacts: strings, rows: objects, stats: objects, rendering: object },
  ],
  video: [
    'Published video evidence and tradeoffs',
    '已发布视频证据与权衡数据',
    {
      sources: objects,
      points: objects,
      curves: object,
      evidence: { type: ['object', 'null'], additionalProperties: true },
      discovery: object,
    },
  ],
} as const;

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
        `Read-only ${en.toLowerCase()} using the dashboard's source handlers and calculation helpers. Unknown and repeated query keys return 400. The response includes resolved params and preserves missing evidence. Renderer-only styling is not an API parameter.${
          view === 'video'
            ? ' Only already published artifacts are read. Cell, phase, slot and GPU-basis choices select result evidence and normalized serving rates; x/y/cost/workload filters produce computed tradeoff points. Local bundles and arbitrary URLs are excluded. Responses are no-store.'
            : view === 'gpu-metrics'
              ? ' Live artifact reads are no-store; statistics use all chips and unsampled values, while chart rows respect selected GPU indices.'
              : ''
        }`,
        `只读${zh}，使用仪表板的数据读取和计算函数。未知或重复查询键返回 400；响应包含解析后的参数，保留缺失数据。仅影响样式的控件不作为 API 参数。${
          view === 'video'
            ? ' 仅读取已发布产物。cell、阶段、slot 和 GPU 口径选择对应结果证据，并计算 serving 归一化速率；x/y、成本及工作负载筛选生成权衡图数据点。不读取本地数据包或任意 URL。响应不缓存。'
            : view === 'gpu-metrics'
              ? ' 实时产物读取不缓存；统计量使用所有芯片的未降采样值，图表行则按芯片索引筛选。'
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

/** Keep legacy detailed contracts and add every newly implemented selector. */
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
