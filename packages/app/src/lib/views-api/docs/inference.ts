import type { ApiOperation, ApiParameter, ApiResponse } from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';
import {
  text,
  stringSchema,
  numberSchema,
  integerSchema,
  booleanSchema,
  objectSchema,
  arraySchema,
  listParam,
} from '@/lib/api-documentation-helpers';

/**
 * Docs fragment for GET /api/v1/views/inference.
 *
 * Assembled into the registry by the coordinator — this module only exports
 * `operations`. The `views` group id is added to `ApiGroupId` during that
 * integration, hence the local cast below.
 */

const VIEWS_GROUP: ApiOperation['group'] = 'views';

const X_MODE_ENUM = [
  'interactivity',
  'ttft',
  'e2e',
  'e2e-normalized-interactivity',
  'concurrency',
] as const;

const parameters: readonly ApiParameter[] = [
  {
    name: 'model',
    location: 'query',
    required: true,
    type: 'string',
    description: text(
      'Frontend model display name (see /api/v1/views/options → models).',
      '前端模型显示名（见 /api/v1/views/options → models）。',
    ),
    schema: stringSchema,
    example: 'DeepSeek-V4-Pro',
  },
  {
    name: 'sequence',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Benchmark sequence. Aliases like 8k-1k and agentic are accepted.',
      '基准序列。也接受 8k-1k、agentic 等别名。',
    ),
    schema: {
      type: 'string',
      enum: ['1k/1k', '1k/8k', '8k/1k', 'agentic-traces'],
      default: '8k/1k',
    },
    example: 'agentic-traces',
  },
  {
    name: 'metric',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Y-axis metric key or config key, e.g. tpPerGpu or y_tokensPerDollarN (see options → metrics).',
      'Y 轴指标键或配置键，如 tpPerGpu 或 y_tokensPerDollarN（见 options → metrics）。',
    ),
    schema: { type: 'string', default: 'y_tokensPerDollarH' },
    example: 'y_tpPerGpu',
  },
  {
    name: 'precisions',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Comma-separated precisions. When omitted, the densest available precision is auto-selected, matching the dashboard default.',
      '逗号分隔的精度列表。省略时按数据最密的精度自动选择，与仪表盘默认行为一致。',
    ),
    schema: { type: 'string', description: 'Comma-separated list of fp4|fp4fp8|fp8|bf16|int4' },
    example: 'fp8,bf16',
  },
  {
    name: 'xmode',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'X-axis mode. concurrency uses observed load levels, with no interpolation or optimization ranking; optimal and best resolve to false. e2e-normalized-interactivity uses persisted derived AgentX metrics; points without eligible derived values are omitted.',
      'X 轴模式。concurrency 使用实测并发值，不插值、不作优化排名；optimal 和 best 均解析为 false。e2e-normalized-interactivity 使用已持久化的 AgentX 派生指标；没有合格派生值的数据点不参与此视图。',
    ),
    schema: { type: 'string', enum: X_MODE_ENUM, default: 'interactivity' },
    example: 'e2e',
  },
  {
    name: 'xstat',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Fixed-sequence service-axis statistic: median (default) or mean. Mean streaming speed is 1 / mean TPOT, not the arithmetic mean of per-request speeds. Mean TTFT and E2E use their recorded mean fields. Missing values are omitted, never replaced with median. Ignored for AgentX and concurrency; params.xstat then resolves to null and xAxis.statistic records the effective percentile or null.',
      '固定长度工作负载服务轴的统计量：median（默认）或 mean。Mean streaming speed 为 1 / mean TPOT，不是各请求速度的算术平均；mean TTFT 和 E2E 使用各自记录的均值。缺失时不回退到 median。AgentX 和 concurrency 不使用此参数，params.xstat 为 null，xAxis.statistic 返回实际分位数或 null。',
    ),
    schema: { type: 'string', enum: ['mean', 'median'], default: 'median' },
    example: 'mean',
  },
  {
    name: 'xmetric',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'TTFT percentile used when the x axis shows time to first token.',
      '当 x 轴为首 Token 时间（TTFT）时使用的百分位。',
    ),
    schema: {
      type: 'string',
      enum: ['median_ttft', 'p75_ttft', 'p90_ttft', 'p95_ttft', 'p99_ttft'],
      default: 'p90_ttft',
    },
    example: 'p99_ttft',
  },
  {
    name: 'percentile',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Latency percentile for agentic-trace x fields.',
      'agentic-traces 场景下 x 轴延迟字段使用的百分位。',
    ),
    schema: { type: 'string', enum: ['p75', 'p90'], default: 'p90' },
    example: 'p75',
  },
  {
    name: 'date',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'As-of date (YYYY-MM-DD): the latest run on or before this date per config.',
      '截止日期（YYYY-MM-DD）：每个配置取该日期当天或之前的最新运行。',
    ),
    schema: { type: 'string', format: 'date' },
    example: '2026-08-01',
  },
  {
    name: 'runId',
    location: 'query',
    required: false,
    type: 'integer',
    description: text(
      'GitHub Actions run id. Returns exactly that run snapshot instead of the latest data.',
      'GitHub Actions 运行 id。返回该次运行的精确快照而非最新数据。',
    ),
    schema: integerSchema,
    example: '12345678',
  },
  listParam(
    'gpus',
    text(
      'Comma-separated hardware keys or bare GPU names to include (e.g. h200 or a full hwKey).',
      '逗号分隔的硬件键或 GPU 名称（如 h200 或完整 hwKey）。',
    ),
    'h200,mi355x',
  ),
  listParam('vendors', text('Comma-separated GPU vendors.', '逗号分隔的 GPU 厂商。'), 'NVIDIA', [
    'AMD',
    'NVIDIA',
  ]),
  listParam(
    'frameworks',
    text('Comma-separated framework families.', '逗号分隔的推理框架系列。'),
    'vllm,sglang',
    ['atom', 'sglang', 'trt', 'vllm'],
  ),
  listParam(
    'deployment',
    text(
      'Comma-separated deployment modes; agg expands to single-node and multi-node.',
      '逗号分隔的部署模式；agg 会展开为 single-node 与 multi-node。',
    ),
    'disagg',
    ['agg', 'disagg', 'multi-node', 'single-node'],
  ),
  listParam(
    'spec',
    text('Comma-separated speculative-decoding modes.', '逗号分隔的投机解码模式。'),
    'mtp',
    ['mtp', 'stp'],
  ),
  {
    name: 'optimal',
    location: 'query',
    required: false,
    type: 'boolean',
    description: text(
      'Return only boundary points per hardware, precision and snapshot date. Measured-power gauges use the higher-power outer envelope, matching the chart; other metrics use their Pareto frontier. The power envelope is not an efficiency recommendation.',
      '仅返回每个硬件在各精度、各快照日期上的边界点。实测功耗指标与图表一致，保留较高功耗侧的外包络；其他指标保留各自的帕累托前沿。功耗包络不构成能效推荐。',
    ),
    schema: { type: 'boolean', default: true },
    example: 'true',
  },
  {
    name: 'best',
    location: 'query',
    required: false,
    type: 'boolean',
    description: text(
      'Return only the best series per GPU SKU. Default depends on model and sequence, matching the dashboard.',
      '仅返回每个 GPU SKU 的最优曲线（对应仪表盘 “Best per SKU” 开关）。',
    ),
    schema: { type: 'boolean' },
    example: 'true',
  },
  {
    name: 'serviceCompare',
    location: 'query',
    required: false,
    type: 'boolean',
    description: text(
      'Include source options, equal-service percentage curves and an optional target comparison, using the same helper as the dashboard. Uses scoped observed points before frontier/best pruning. JSON only.',
      '返回来源选项、同等服务条件下的百分比对比曲线，以及可选目标值对比；复用仪表板计算逻辑，使用筛选后、前沿和 best 筛选前的实测点。仅支持 JSON。',
    ),
    schema: { type: 'boolean', default: false },
    example: 'true',
  },
  {
    name: 'serviceBaseline',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Exact baseline key from serviceSources. Omitted selects the first deterministic source; an unknown explicit key remains unavailable. Percent change is 100 × (comparator / baseline − 1).',
      'serviceSources 中的完整基准来源键。省略时按确定性顺序选择首项；显式未知键保持不可用。变化百分比为 100 ×（对比值 / 基准值 − 1）。',
    ),
    schema: stringSchema,
    example: 'Exact key returned in serviceSources',
  },
  {
    name: 'serviceComparator',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Exact comparator key from serviceSources. Omitted selects the second deterministic source. Keys retain hardware, source run, recipe, topology and workload identity; never replace them with a hardware name.',
      'serviceSources 中的完整对比来源键。省略时按确定性顺序选择第二项。来源键保留硬件、运行、配置配方、拓扑和工作负载标识，不能用硬件名称代替。',
    ),
    schema: stringSchema,
    example: 'Exact key returned in serviceSources',
  },
  {
    name: 'serviceTarget',
    location: 'query',
    required: false,
    type: 'number',
    description: text(
      'Positive finite service-axis target: tok/s/user for streaming speed, seconds for TTFT/E2E. Omitted returns the curve and null target comparison. Numerical linear interpolation is bounded by each exact source; no extrapolation or interpolation across missing metric endpoints. Concurrency is unsupported.',
      '有限正数服务轴目标：streaming speed 单位为 tok/s/user，TTFT/E2E 单位为秒。省略时返回曲线，目标值对比为 null。仅在各完整来源的实测范围内做数值线性插值，不外推、不跨越缺失指标端点。并发轴不适用。',
    ),
    schema: { type: 'number', minimum: Number.MIN_VALUE },
    example: 40,
  },
  {
    name: 'roleShare',
    location: 'query',
    required: false,
    type: 'boolean',
    description: text(
      'Include validated disaggregated prefill/decode energy shares on one output-token denominator. Uses same-window aggregate J/output ÷ J/input to convert prefill J/input; share denominator is reconstructed prefill + decode energy, not pool-local token counts. Missing/invalid data is omitted. JSON only.',
      '返回通过验证的分离式 prefill/decode 能耗占比，统一使用 output token 分母。用同窗口总 J/output ÷ J/input 将 prefill J/input 转换为 J/output；占比分母为重建的 prefill + decode 能耗，不使用各池独立的 token 数。缺失或无效数据不返回，仅支持 JSON。',
    ),
    schema: { type: 'boolean', default: false },
    example: 'true',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Response encoding. csv returns one flat row per plotted point; serviceCompare and roleShare panels require JSON and return 400 with CSV.',
      '响应编码。csv 为每个图表点返回一行平面数据；serviceCompare 和 roleShare 面板仅支持 JSON，与 CSV 同用时返回 400。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'csv',
  },
];

const pointSchema = objectSchema(
  {
    id: integerSchema,
    precision: stringSchema,
    x: numberSchema,
    y: numberSchema,
    concurrency: numberSchema,
    topologyKey: stringSchema,
    tp: numberSchema,
    date: { type: 'string', format: 'date' },
    runId: integerSchema,
    frontier: booleanSchema,
    bestPerSku: booleanSchema,
    metrics: { type: 'object', additionalProperties: numberSchema },
  },
  ['x', 'y', 'concurrency', 'topologyKey', 'tp', 'date', 'frontier', 'bestPerSku', 'metrics'],
);

const seriesSchema = objectSchema(
  {
    hwKey: stringSchema,
    gpu: stringSchema,
    framework: stringSchema,
    specMethod: stringSchema,
    label: stringSchema,
    vendor: stringSchema,
    deployment: stringSchema,
    kvOffload: booleanSchema,
    bestPerSku: booleanSchema,
    points: arraySchema(pointSchema),
  },
  [
    'hwKey',
    'gpu',
    'framework',
    'specMethod',
    'label',
    'deployment',
    'kvOffload',
    'bestPerSku',
    'points',
  ],
);

const sourceSchema = objectSchema({ key: stringSchema, label: stringSchema }, ['key', 'label']);
const identitySchema = objectSchema({
  id: { type: ['integer', 'null'] },
  sourceKey: stringSchema,
  hwKey: stringSchema,
  precision: stringSchema,
  concurrency: numberSchema,
  topologyKey: stringSchema,
  date: stringSchema,
  runUrl: { type: ['string', 'null'] },
  recipeFingerprint: { type: ['string', 'null'] },
  image: { type: ['string', 'null'] },
});
const estimateSchema = {
  ...objectSchema({
    value: numberSchema,
    interpolated: booleanSchema,
    endpoints: arraySchema(
      objectSchema({ x: numberSchema, value: numberSchema, point: identitySchema }),
    ),
  }),
  type: ['object', 'null'] as const,
};
const serviceMetricSchema = objectSchema({
  baseline: estimateSchema,
  comparator: estimateSchema,
  changePercent: { type: ['number', 'null'] },
  reason: stringSchema,
});
const comparisonSchema = objectSchema({
  target: numberSchema,
  xField: stringSchema,
  baseline: { ...sourceSchema, type: ['object', 'null'] },
  comparator: { ...sourceSchema, type: ['object', 'null'] },
  reason: stringSchema,
  metrics: objectSchema({
    meanWattsPerGpu: { ...serviceMetricSchema, description: 'Mean measured GPU board W/GPU.' },
    outputTokensPerSecond: {
      ...serviceMetricSchema,
      description:
        'Whole-deployment output tokens/s; disaggregated GPU-count normalization preserves the workload denominator.',
    },
    joulesPerOutputToken: {
      ...serviceMetricSchema,
      description: 'Validated measured GPU joules per output token.',
    },
  }),
});

const responseSchema = objectSchema(
  {
    view: { type: 'string', enum: ['inference'] },
    apiVersion: { type: 'string', enum: ['v1'] },
    params: { type: 'object', additionalProperties: true },
    metric: objectSchema(
      {
        key: stringSchema,
        configKey: stringSchema,
        label: stringSchema,
        labelZh: stringSchema,
        unit: { type: ['string', 'null'] },
        polarity: { type: ['string', 'null'] },
        direction: {
          type: ['string', 'null'],
          description: 'Configured optimization direction, also used by best-per-SKU selection.',
        },
      },
      ['key', 'configKey', 'label', 'labelZh'],
    ),
    xAxis: objectSchema({
      mode: stringSchema,
      field: stringSchema,
      label: stringSchema,
      statistic: { type: ['string', 'null'] },
    }),
    frontier: objectSchema({
      direction: {
        type: ['string', 'null'],
        description:
          'Selected boundary direction; null for observed concurrency, which has no preferred direction. Measured-power gauges use upper_right for interactivity or upper_left for latency, independently of metric.direction.',
      },
      points: integerSchema,
    }),
    hardware: arraySchema(
      objectSchema({ key: stringSchema, label: stringSchema, vendor: stringSchema }, [
        'key',
        'label',
      ]),
    ),
    series: arraySchema(seriesSchema),
    count: integerSchema,
    serviceSources: arraySchema(sourceSchema),
    equalServiceComparison: { ...comparisonSchema, type: ['object', 'null'] },
    equalServiceCurve: arraySchema(comparisonSchema),
    roleEnergyShares: arraySchema(
      objectSchema({
        x: numberSchema,
        sourceKey: stringSchema,
        point: identitySchema,
        prefill: { ...numberSchema, description: 'Prefill energy in J/output token.' },
        decode: { ...numberSchema, description: 'Decode energy in J/output token.' },
        total: {
          ...numberSchema,
          description: 'Reconstructed prefill + decode energy in J/output token.',
        },
        prefillShare: {
          ...numberSchema,
          description: 'Prefill percentage of reconstructed total.',
        },
        decodeShare: { ...numberSchema, description: 'Decode percentage of reconstructed total.' },
      }),
    ),
    pricing: { type: ['object', 'null'], additionalProperties: true },
    comparisons: arraySchema({ type: 'object', additionalProperties: true }),
    overlays: arraySchema({ type: 'object', additionalProperties: true }),
  },
  ['view', 'apiVersion', 'params', 'metric', 'xAxis', 'frontier', 'series', 'count'],
);

const responseExample = {
  view: 'inference',
  apiVersion: 'v1',
  params: {
    model: 'DeepSeek-V4-Pro',
    sequence: '8k/1k',
    precisions: ['fp8'],
    metric: 'y_tpPerGpu',
    xmode: 'interactivity',
    xstat: 'median',
    xmetric: 'p90_ttft',
    percentile: 'p90',
    date: null,
    runId: null,
    gpus: [],
    vendors: [],
    frameworks: [],
    deployment: [],
    spec: [],
    topologies: [],
    optimal: true,
    best: true,
    format: 'json',
    serviceCompare: false,
    serviceBaseline: null,
    serviceComparator: null,
    serviceTarget: null,
    roleShare: false,
  },
  metric: {
    key: 'tpPerGpu',
    configKey: 'y_tpPerGpu',
    label: 'Output Throughput per GPU (tok/s/gpu)',
    labelZh: '单 GPU 输出吞吐（tok/s/gpu）',
    unit: 'tok/s/gpu',
    polarity: 'higher',
    direction: 'upper_left',
  },
  xAxis: {
    mode: 'interactivity',
    field: 'median_intvty',
    statistic: 'median',
    label: 'Median Interactivity (tok/s/user)',
  },
  frontier: { direction: 'upper_left', points: 14 },
  hardware: [{ key: 'h200_trt', label: 'H200 (TRTLLM)', vendor: 'NVIDIA' }],
  series: [
    {
      hwKey: 'h200_trt',
      gpu: 'h200',
      framework: 'trt',
      specMethod: 'none',
      label: 'H200 (TRTLLM)',
      vendor: 'NVIDIA',
      deployment: 'single-node',
      kvOffload: false,
      bestPerSku: true,
      points: [
        {
          x: 12.5,
          y: 450.5,
          concurrency: 64,
          topologyKey: 'Single|GPU=8|DP=?|TP=8|EP=1|PP=?|DCP=?|PCP=?|DPA=0|offload=off',
          tp: 8,
          date: '2026-08-20',
          runId: 12345678,
          frontier: true,
          bestPerSku: true,
          metrics: { tpPerGpu: 450.5, outputTputPerGpu: 400.2, inputTputPerGpu: 50.3 },
        },
      ],
    },
  ],
  count: 1,
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Chart-ready series grouped by hardware config, with frontier and best-per-SKU flags per point.',
      '按硬件配置分组的图表就绪序列，每个数据点带帕累托前沿与 best-per-SKU 标记。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'hwKey,gpu,framework,specMethod,label,vendor,deployment,kvOffload,x,y,concurrency,topologyKey,tp,date,runId,frontier,bestPerSku,metric_tpPerGpu\r\nh200_trt,h200,trt,none,H200 (TRTLLM),NVIDIA,single-node,false,12.5,450.5,64,Single|GPU=8|DP=?|TP=8|EP=1|PP=?|DCP=?|PCP=?|DPA=0|offload=off,8,2026-08-20,12345678,true,true,450.5',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'A parameter is invalid. The body names the parameter and, for enums, lists the allowed values.',
      '参数无效。响应体会给出参数名，枚举参数还会列出允许的取值。',
    ),
    schema: {
      type: 'object',
      properties: { error: stringSchema },
      required: ['error'],
      additionalProperties: true,
    },
    example: { error: 'Unknown xmode: bogus', param: 'xmode', allowed: X_MODE_ENUM },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The benchmark query failed.', '基准数据查询失败。'),
    schema: {
      type: 'object',
      properties: { error: stringSchema },
      required: ['error'],
      additionalProperties: true,
    },
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-inference-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/inference',
    summary: text('Get the main inference chart view', '获取主推理图表视图'),
    description: text(
      'Returns the chart-ready series the /inference scatter chart renders: per hardware config, x/y points at each measured concurrency for the selected metric, sequence, precisions and x-axis mode, with boundary and best-per-SKU flags computed by the same code the dashboard runs. Filters mirror the dashboard quick filters (gpus, vendors, framework families, deployment, spec). Use optimal=true for boundary points or best=true for the best series per GPU SKU. Measured-power boundaries follow the higher-power outer envelope: frontier.direction describes that boundary, while metric.direction remains the optimization direction used by best-per-SKU selection.',
      '返回 /inference 散点图所用的序列：按硬件配置分组，在所选指标、序列、精度与 x 轴模式下给出各并发档位的 x/y 数据点，并复用仪表板代码计算边界与 best-per-SKU 标记。筛选参数与仪表板快捷筛选一致（gpus、vendors、框架系列、部署模式、投机解码）。设置 optimal=true 可只保留边界点，best=true 可只保留每个 GPU SKU 的最优曲线。实测功耗使用较高功耗侧的外包络：frontier.direction 描述这一边界，metric.direction 则保留 best-per-SKU 选择所用的优化方向。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'InferenceView',
    curlUrl: `${API_BASE_URL}/api/v1/views/inference?model=DeepSeek-V4-Pro&metric=y_tokensPerDollarN&sequence=8k-1k`,
  },
];
