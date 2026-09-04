import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/inference.
 *
 * Assembled into the registry by the coordinator — this module only exports
 * `operations`. The `views` group id is added to `ApiGroupId` during that
 * integration, hence the local cast below.
 */

const VIEWS_GROUP: ApiOperation['group'] = 'views';

const text = (en: string, zh: string): BilingualText => ({ en, zh });
const stringSchema: ApiSchema = { type: 'string' };
const numberSchema: ApiSchema = { type: 'number' };
const integerSchema: ApiSchema = { type: 'integer' };
const booleanSchema: ApiSchema = { type: 'boolean' };
const objectSchema = (
  properties: Readonly<Record<string, ApiSchema>>,
  required: readonly string[] = Object.keys(properties),
): ApiSchema => ({ type: 'object', properties, required, additionalProperties: false });
const arraySchema = (items: ApiSchema): ApiSchema => ({ type: 'array', items });
const listParam = (
  name: string,
  description: BilingualText,
  example: string,
  enumValues?: readonly string[],
): ApiParameter => ({
  name,
  location: 'query',
  required: false,
  type: 'string',
  description,
  schema: enumValues
    ? { type: 'string', enum: enumValues, description: 'Comma-separated list' }
    : { type: 'string', description: 'Comma-separated list' },
  example,
});

const X_MODE_ENUM = ['interactivity', 'ttft', 'e2e', 'e2e-normalized-interactivity'] as const;

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
      'X-axis mode. e2e-normalized-interactivity is trace-derived client-side only and resolves to interactivity here.',
      'X 轴模式。e2e-normalized-interactivity 仅在客户端由 trace 推导，此处会解析为 interactivity。',
    ),
    schema: { type: 'string', enum: X_MODE_ENUM, default: 'interactivity' },
    example: 'e2e',
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
      'Return only Pareto-frontier points per hardware and snapshot date.',
      '仅返回每个硬件在各快照日期上的帕累托前沿点。',
    ),
    schema: { type: 'boolean', default: false },
    example: 'true',
  },
  {
    name: 'best',
    location: 'query',
    required: false,
    type: 'boolean',
    description: text(
      'Return only the best series per GPU SKU (the dashboard "Best per SKU" toggle).',
      '仅返回每个 GPU SKU 的最优曲线（对应仪表盘 “Best per SKU” 开关）。',
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
      'Response encoding. csv returns one flat row per point.',
      '响应编码。csv 为每个数据点返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'csv',
  },
];

const pointSchema = objectSchema(
  {
    x: numberSchema,
    y: numberSchema,
    concurrency: numberSchema,
    tp: numberSchema,
    date: { type: 'string', format: 'date' },
    runId: integerSchema,
    frontier: booleanSchema,
    bestPerSku: booleanSchema,
    metrics: { type: 'object', additionalProperties: numberSchema },
  },
  ['x', 'y', 'concurrency', 'tp', 'date', 'frontier', 'bestPerSku', 'metrics'],
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
        direction: { type: ['string', 'null'] },
      },
      ['key', 'configKey', 'label', 'labelZh'],
    ),
    xAxis: objectSchema({ mode: stringSchema, field: stringSchema, label: stringSchema }),
    frontier: objectSchema({
      direction: { type: ['string', 'null'] },
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
    xmetric: 'p90_ttft',
    percentile: 'p90',
    date: null,
    runId: null,
    gpus: [],
    vendors: [],
    frameworks: [],
    deployment: [],
    spec: [],
    optimal: false,
    best: false,
    format: 'json',
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
          'hwKey,gpu,framework,specMethod,label,vendor,deployment,kvOffload,x,y,concurrency,tp,date,runId,frontier,bestPerSku,metric_tpPerGpu\r\nh200_trt,h200,trt,none,H200 (TRTLLM),NVIDIA,single-node,false,12.5,450.5,64,8,2026-08-20,12345678,true,true,450.5',
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
      'Returns the chart-ready series the /inference scatter chart renders: per hardware config, x/y points at each measured concurrency for the selected metric, sequence, precisions and x-axis mode, with Pareto-frontier and best-per-SKU flags computed by the same code the dashboard runs. Filters mirror the dashboard quick filters (gpus, vendors, framework families, deployment, spec). Use optimal=true or best=true to keep only frontier points or the best series per GPU SKU.',
      '返回 /inference 散点图渲染的图表就绪序列：按硬件配置分组，在所选指标、序列、精度与 x 轴模式下给出各并发档位的 x/y 数据点，并由与仪表盘相同的代码计算帕累托前沿与 best-per-SKU 标记。筛选参数与仪表盘快捷筛选一致（gpus、vendors、框架系列、部署模式、投机解码）。设置 optimal=true 或 best=true 可只保留前沿点或每个 GPU SKU 的最优曲线。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'InferenceView',
    curlUrl: `${API_BASE_URL}/api/v1/views/inference?model=DeepSeek-V4-Pro&metric=y_tokensPerDollarN&sequence=8k-1k`,
  },
];
