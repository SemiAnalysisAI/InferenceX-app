import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

// The 'views' group id is registered by the docs coordinator alongside the
// route catalog entries; fragments are written against it ahead of that.
const VIEWS_GROUP: ApiOperation['group'] = 'views';

const text = (en: string, zh: string): BilingualText => ({ en, zh });

const parameter = (
  name: string,
  required: boolean,
  type: string,
  en: string,
  zh: string,
  schema: ApiSchema,
  example: boolean | number | string,
): ApiParameter => ({
  name,
  location: 'query',
  required,
  type,
  description: text(en, zh),
  schema,
  example,
});

const errorSchema: ApiSchema = {
  type: 'object',
  properties: { error: { type: 'string' }, param: { type: 'string' } },
  required: ['error'],
  additionalProperties: true,
};

const nearestPointSchema: ApiSchema = {
  type: ['object', 'null'],
  properties: {
    interactivity: { type: 'number' },
    throughput: { type: 'number' },
    concurrency: { type: 'number' },
  },
  additionalProperties: false,
};

const hardwareResultSchema: ApiSchema = {
  type: 'object',
  properties: {
    hwKey: { type: 'string' },
    resultKey: { type: 'string' },
    precision: { type: ['string', 'null'] },
    label: { type: 'string' },
    value: { type: 'number' },
    inputThroughput: { type: 'number' },
    outputThroughput: { type: 'number' },
    cost: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        input: { type: 'number' },
        output: { type: 'number' },
      },
      required: ['total', 'input', 'output'],
      additionalProperties: false,
    },
    tpPerMw: { type: 'number' },
    inputTpPerMw: { type: 'number' },
    outputTpPerMw: { type: 'number' },
    concurrency: { type: 'number' },
    cacheHitRate: { type: ['number', 'null'] },
    inputTokenShare: { type: ['number', 'null'] },
    clamped: { type: 'boolean' },
    clampedAbove: { type: 'boolean' },
    clampedBelow: { type: 'boolean' },
    nearest: {
      type: 'object',
      properties: { below: nearestPointSchema, above: nearestPointSchema },
      required: ['below', 'above'],
      additionalProperties: false,
    },
    fleet: {
      type: ['object', 'null'],
      description: 'Present only when mw is set.',
      properties: {
        chips: { type: 'number' },
        totalTokPerSec: { type: 'number' },
        concurrentUsers: { type: 'number' },
        costPerHour: { type: 'number' },
        costPerMonth: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  required: [
    'hwKey',
    'resultKey',
    'precision',
    'label',
    'value',
    'inputThroughput',
    'outputThroughput',
    'cost',
    'tpPerMw',
    'inputTpPerMw',
    'outputTpPerMw',
    'concurrency',
    'cacheHitRate',
    'inputTokenShare',
    'clamped',
    'clampedAbove',
    'clampedBelow',
    'nearest',
  ],
  additionalProperties: false,
};

const responseSchema: ApiSchema = {
  type: 'object',
  properties: {
    view: { type: 'string', enum: ['calculator'] },
    apiVersion: { type: 'string', enum: ['v1'] },
    generatedAt: {
      type: ['string', 'null'],
      description: 'Latest run date among the rows the view was computed from.',
    },
    params: { type: 'object', additionalProperties: true },
    hardware: { type: 'array', items: hardwareResultSchema },
    costCap: {
      type: 'array',
      description: 'Present only when costcap is set.',
      items: {
        type: 'object',
        properties: {
          hwKey: { type: 'string' },
          resultKey: { type: 'string' },
          label: { type: 'string' },
          maxInteractivity: { type: ['number', 'null'] },
          throughput: { type: ['number', 'null'] },
          concurrentUsers: { type: ['number', 'null'] },
        },
        required: [
          'hwKey',
          'resultKey',
          'label',
          'maxInteractivity',
          'throughput',
          'concurrentUsers',
        ],
        additionalProperties: false,
      },
    },
    count: { type: 'integer' },
  },
  required: ['view', 'apiVersion', 'generatedAt', 'params', 'hardware', 'count'],
  additionalProperties: false,
};

const successExample = {
  view: 'calculator',
  apiVersion: 'v1',
  generatedAt: '2026-08-20',
  params: {
    model: 'DeepSeek-V4-Pro',
    sequence: '1k/1k',
    precisions: ['fp4'],
    target: 35,
    mode: 'interactivity-to-throughput',
    costProvider: 'costh',
    costType: 'total',
    percentile: 'p90',
    gpus: [],
    format: 'json',
  },
  hardware: [
    {
      hwKey: 'b300_sglang',
      resultKey: 'b300_sglang',
      precision: 'fp4',
      label: 'B300 (SGLang)',
      value: 1234.5,
      inputThroughput: 820.1,
      outputThroughput: 414.4,
      cost: { total: 1.21, input: 1.83, output: 3.62 },
      tpPerMw: 890123.4,
      inputTpPerMw: 591234.5,
      outputTpPerMw: 298888.9,
      concurrency: 24,
      cacheHitRate: null,
      inputTokenShare: 0.5,
      clamped: false,
      clampedAbove: false,
      clampedBelow: false,
      nearest: {
        below: { interactivity: 30, throughput: 1500, concurrency: 32 },
        above: { interactivity: 50, throughput: 900, concurrency: 16 },
      },
    },
  ],
  count: 1,
};

const successResponse: ApiResponse = {
  status: '200',
  description: text(
    'Steffen–Hermite interpolated operating point per hardware config at the requested target.',
    '每个硬件配置在所请求目标下经 Steffen–Hermite 插值得到的工作点。',
  ),
  schema: responseSchema,
  example: successExample,
  mediaType: 'application/json',
  alternateRepresentations: [
    {
      mediaType: 'text/csv',
      schema: { type: 'string', description: 'One flat row per hardware result.' },
      example:
        'hwKey,resultKey,precision,label,value,inputThroughput,outputThroughput,costTotal,costInput,costOutput,tpPerMw,concurrency,clamped,clampedAbove,clampedBelow\nb300_sglang,b300_sglang,fp4,B300 (SGLang),1234.5,820.1,414.4,1.21,1.83,3.62,890123.4,24,false,false,false',
    },
  ],
};

export const operations: ApiOperation[] = [
  {
    id: 'get-calculator-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/calculator',
    summary: text('Interpolated calculator operating points', '插值计算器工作点'),
    description: text(
      'Computes the throughput calculator server-side: benchmark sweeps are grouped per hardware config, reduced to their Pareto frontier, and read at the requested target with the same monotone Steffen–Hermite interpolation the dashboard uses. Optionally sizes a fixed-power fleet per config (mw) and reports each config’s maximum interactivity under a $/M-token cost cap (costcap).',
      '在服务端计算吞吐计算器：基准测试扫描按硬件配置分组，取帕累托前沿，并用与仪表盘相同的单调 Steffen–Hermite 插值在所请求目标处求值。可选地按固定功率为每个配置估算集群规模（mw），并给出每个配置在 $/M token 成本上限内的最大交互性（costcap）。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'model',
        true,
        'string',
        'Display model name or compare slug.',
        '展示模型名称或对比 slug。',
        { type: 'string' },
        'DeepSeek-V4-Pro',
      ),
      parameter(
        'sequence',
        false,
        'enum',
        'Workload sequence. Accepts 1k/1k, 1k/8k, 8k/1k (or hyphenated forms) and agentic-traces (alias agentic).',
        '负载序列。支持 1k/1k、1k/8k、8k/1k（或连字符形式）以及 agentic-traces（别名 agentic）。',
        { type: 'string', default: '8k/1k' },
        '1k/1k',
      ),
      parameter(
        'precisions',
        false,
        'CSV list',
        'Comma-separated precisions. Omit to auto-select the densest precision in the data.',
        '以逗号分隔的精度列表。省略时自动选择数据中曲线最密的精度。',
        { type: 'string' },
        'fp4,fp8',
      ),
      parameter(
        'target',
        false,
        'number',
        'Target value on the input axis: interactivity in tok/s/user, or throughput in tok/s/GPU when mode is throughput-to-interactivity.',
        '输入轴上的目标值：交互性（tok/s/user）；当 mode 为 throughput-to-interactivity 时为吞吐（tok/s/GPU）。',
        { type: 'number', default: 35, minimum: 0 },
        35,
      ),
      parameter(
        'mode',
        false,
        'enum',
        'Interpolation direction.',
        '插值方向。',
        {
          type: 'string',
          enum: ['interactivity-to-throughput', 'throughput-to-interactivity'],
          default: 'interactivity-to-throughput',
        },
        'interactivity-to-throughput',
      ),
      parameter(
        'costProvider',
        false,
        'enum',
        'Cost basis: costh (H100-rental-indexed), costn (neocloud), costr (reference).',
        '成本基准：costh（按 H100 租赁价折算）、costn（neocloud）、costr（参考价）。',
        { type: 'string', enum: ['costh', 'costn', 'costr'], default: 'costh' },
        'costh',
      ),
      parameter(
        'costType',
        false,
        'enum',
        'Token basis for cost and throughput fields.',
        '成本与吞吐字段所用的 token 口径。',
        { type: 'string', enum: ['total', 'input', 'output'], default: 'total' },
        'total',
      ),
      parameter(
        'percentile',
        false,
        'enum',
        'Interactivity percentile for agentic traces; fixed sequences use the median.',
        'agentic traces 的交互性分位数；固定序列使用中位数。',
        { type: 'string', enum: ['p75', 'p90'], default: 'p90' },
        'p90',
      ),
      parameter(
        'mw',
        false,
        'number',
        'Facility power budget in MW. When set, each result carries a fleet block (chips, total tok/s, concurrent users, cost).',
        '设施功率预算（MW）。设置后每个结果附带 fleet 字段（芯片数、总 tok/s、并发用户数、成本）。',
        { type: 'number', minimum: 0 },
        100,
      ),
      parameter(
        'costcap',
        false,
        'number',
        'Cost cap in $/M tokens. When set, the response carries a costCap section with each config’s maximum interactivity under the cap.',
        '成本上限（$/M token）。设置后响应附带 costCap 部分，给出各配置在上限内的最大交互性。',
        { type: 'number', minimum: 0 },
        2.5,
      ),
      parameter(
        'date',
        false,
        'date',
        'Use data on or before YYYY-MM-DD. Omit for latest.',
        '使用 YYYY-MM-DD 当日或之前的数据。省略则使用最新数据。',
        { type: 'string', format: 'date' },
        '2026-08-08',
      ),
      parameter(
        'runId',
        false,
        'string',
        'Numeric GitHub workflow run id to pin the snapshot to.',
        '用于固定数据快照的 GitHub workflow 运行编号（数字）。',
        { type: 'string', pattern: '^\\d+$' },
        '123456789',
      ),
      parameter(
        'gpus',
        false,
        'CSV list',
        'Comma-separated hardware keys; matches a full hwKey (b300_sglang) or a base chip (b300).',
        '以逗号分隔的硬件键；可匹配完整 hwKey（b300_sglang）或基础芯片（b300）。',
        { type: 'string' },
        'b300,mi355x',
      ),
      parameter(
        'format',
        false,
        'enum',
        'Response encoding.',
        '响应编码。',
        { type: 'string', enum: ['json', 'csv'], default: 'json' },
        'json',
      ),
    ],
    responses: [
      successResponse,
      {
        status: '400',
        description: text(
          'Invalid parameter. The body names the parameter and, for enums, the allowed values.',
          '参数无效。响应体给出参数名；枚举类参数还会给出允许的取值。',
        ),
        schema: errorSchema,
        example: {
          error: 'Unknown mode: sideways',
          param: 'mode',
          allowed: ['interactivity-to-throughput', 'throughput-to-interactivity'],
        },
        mediaType: 'application/json',
      },
      {
        status: '500',
        description: text('Calculator view failed.', '计算器视图构建失败。'),
        schema: errorSchema,
        example: { error: 'Internal server error' },
        mediaType: 'application/json',
      },
    ],
    responseShapeName: 'CalculatorView',
    curlUrl: `${API_BASE_URL}/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k`,
  },
];
