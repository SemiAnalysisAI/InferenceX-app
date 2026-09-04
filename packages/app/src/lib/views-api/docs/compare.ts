import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/compare.
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
const nullableString: ApiSchema = { type: ['string', 'null'] };
const nullableNumber: ApiSchema = { type: ['number', 'null'] };
const objectSchema = (
  properties: Readonly<Record<string, ApiSchema>>,
  required: readonly string[] = Object.keys(properties),
): ApiSchema => ({ type: 'object', properties, required, additionalProperties: false });
const arraySchema = (items: ApiSchema): ApiSchema => ({ type: 'array', items });
const errorSchema: ApiSchema = {
  type: 'object',
  properties: { error: stringSchema },
  required: ['error'],
  additionalProperties: true,
};

const parameters: readonly ApiParameter[] = [
  {
    name: 'slug',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Compare-page slug, <model>-<gpuA>-vs-<gpuB>. Either slug or model+gpus is required; GPU order is canonicalized like the page redirect.',
      '对比页 slug，格式为 <model>-<gpuA>-vs-<gpuB>。slug 与 model+gpus 二选一；GPU 顺序会像页面跳转一样归一化。',
    ),
    schema: stringSchema,
    example: 'deepseek-v4-b200-vs-mi355x',
  },
  {
    name: 'model',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Display model name (case-insensitive) or compare-page model slug. Use together with gpus as an alternative to slug.',
      '展示模型名称（不区分大小写）或对比页模型 slug。与 gpus 搭配使用，可替代 slug。',
    ),
    schema: stringSchema,
    example: 'DeepSeek-V4-Pro',
  },
  {
    name: 'gpus',
    location: 'query',
    required: false,
    type: 'CSV GPU list',
    description: text(
      'Exactly 2 distinct GPU base keys, comma-separated (e.g. b200,mi355x). Unknown keys return 400 with the allowed list.',
      '恰好 2 个不同的 GPU 基础键，以逗号分隔（例如 b200,mi355x）。未知键返回 400 并列出允许的取值。',
    ),
    schema: { type: 'string', pattern: '^[a-z0-9_]+,[a-z0-9_]+$' },
    example: 'b200,mi355x',
  },
  {
    name: 'scenario',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Workload sequence. Aliases: 8k-1k, 1k-1k, 1k-8k, agentic. Default: the pair default the page picks (AgentX-featured models fall back to agentic-traces, others to 8k/1k).',
      '工作负载序列。别名：8k-1k、1k-1k、1k-8k、agentic。默认为页面选取的组合默认值（AgentX 精选模型回退到 agentic-traces，其余为 8k/1k）。',
    ),
    schema: { type: 'string', enum: ['1k/1k', '1k/8k', '8k/1k', 'agentic-traces'] },
    example: '8k/1k',
  },
  {
    name: 'variant',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'View variant. per-dollar switches the winner/delta basis from throughput to $/M tokens; precision adds a per-precision head-to-head summary; spec-decode adds a per-speculative-decoding-method breakdown (fixed sequences only).',
      '视图变体。per-dollar 将胜负与差值的比较基准从吞吐切换为每百万 token 成本；precision 增加按精度的对比摘要；spec-decode 增加按投机解码方法的拆分（仅固定序列场景）。',
    ),
    schema: {
      type: 'string',
      enum: ['default', 'per-dollar', 'precision', 'spec-decode'],
      default: 'default',
    },
    example: 'per-dollar',
  },
  {
    name: 'tiers',
    location: 'query',
    required: false,
    type: 'CSV number list',
    description: text(
      'Custom interactivity targets (tok/s/user), comma-separated, max 12. Default: the 3 page targets spanning the shared measured range. Requested tiers outside the measured range are dropped.',
      '自定义交互性目标（每用户 tok/s），逗号分隔，最多 12 个。默认为页面在共同测量范围内选取的 3 个目标。超出测量范围的档位会被忽略。',
    ),
    schema: { type: 'string' },
    example: '25,50,75',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Response format. CSV returns one flat row per tier.',
      '响应格式。CSV 为每个档位返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'json',
  },
];

const cellSchema: ApiSchema = {
  type: ['object', 'null'],
  properties: {
    hardware: stringSchema,
    configKey: stringSchema,
    throughputPerGpu: numberSchema,
    inputThroughputPerGpu: numberSchema,
    outputThroughputPerGpu: numberSchema,
    costPerMtok: numberSchema,
    costPerMtokInput: numberSchema,
    costPerMtokOutput: numberSchema,
    throughputPerMw: numberSchema,
    concurrency: numberSchema,
    precision: nullableString,
    clamped: booleanSchema,
  },
  additionalProperties: false,
};

const headToHeadSchema: ApiSchema = {
  type: ['object', 'null'],
  properties: {
    faster: stringSchema,
    slower: stringSchema,
    tputPct: numberSchema,
    cheaper: stringSchema,
    pricier: stringSchema,
    costPct: numberSchema,
  },
  additionalProperties: false,
};

const summarySideSchema: ApiSchema = {
  type: 'object',
  properties: {
    hardware: stringSchema,
    configCount: integerSchema,
    bestThroughputPerGpu: nullableNumber,
    bestMedianTtft: nullableNumber,
    bestMedianTpot: nullableNumber,
  },
  additionalProperties: true,
};

const responseSchema: ApiSchema = objectSchema({
  view: { type: 'string', enum: ['compare'] },
  apiVersion: { type: 'string', enum: ['v1'] },
  generatedAt: { ...nullableString, format: 'date' },
  params: {
    type: 'object',
    properties: {
      slug: stringSchema,
      model: stringSchema,
      gpus: arraySchema(stringSchema),
      scenario: stringSchema,
      variant: stringSchema,
      tiers: { oneOf: [{ type: 'string', enum: ['default'] }, arraySchema(numberSchema)] },
      format: { type: 'string', enum: ['json', 'csv'] },
    },
    additionalProperties: false,
  },
  model: objectSchema({
    slug: stringSchema,
    displayName: stringSchema,
    label: stringSchema,
  }),
  gpus: arraySchema(stringSchema),
  scenario: nullableString,
  precision: nullableString,
  variant: stringSchema,
  tiers: arraySchema(numberSchema),
  interactivityRange: objectSchema({ min: numberSchema, max: numberSchema }),
  dataRange: objectSchema({ oldest: nullableString, newest: nullableString }),
  table: arraySchema(
    objectSchema({
      tier: numberSchema,
      a: cellSchema,
      b: cellSchema,
      basis: { type: 'string', enum: ['throughputPerGpu', 'costPerMtok'] },
      deltaPct: nullableNumber,
      winner: nullableString,
    }),
  ),
  summary: {
    type: 'object',
    properties: {
      a: summarySideSchema,
      b: summarySideSchema,
      headToHead: headToHeadSchema,
      byPrecision: arraySchema(
        objectSchema({
          precision: stringSchema,
          tiers: arraySchema(numberSchema),
          headToHead: headToHeadSchema,
        }),
      ),
      bySpecDecode: arraySchema(
        objectSchema({
          specMethod: stringSchema,
          tier: numberSchema,
          a: cellSchema,
          b: cellSchema,
        }),
      ),
    },
    required: ['a', 'b', 'headToHead'],
    additionalProperties: false,
  },
});

const responseExample = {
  view: 'compare',
  apiVersion: 'v1',
  generatedAt: '2026-08-20',
  params: {
    slug: 'deepseek-v4-b200-vs-mi355x',
    model: 'DeepSeek-V4-Pro',
    gpus: ['b200', 'mi355x'],
    scenario: 'auto',
    variant: 'default',
    tiers: 'default',
    format: 'json',
  },
  model: { slug: 'deepseek-v4', displayName: 'DeepSeek-V4-Pro', label: 'DeepSeekv4 Pro 0813 1.6T' },
  gpus: ['b200', 'mi355x'],
  scenario: 'agentic-traces',
  precision: 'fp8',
  variant: 'default',
  tiers: [21, 34, 47],
  interactivityRange: { min: 12, max: 55 },
  dataRange: { oldest: '2026-05-02', newest: '2026-08-20' },
  table: [
    {
      tier: 34,
      a: {
        hardware: 'b200',
        configKey: 'b200_sglang',
        throughputPerGpu: 1315.2,
        inputThroughputPerGpu: 9821.4,
        outputThroughputPerGpu: 1315.2,
        costPerMtok: 0.42,
        costPerMtokInput: 0.06,
        costPerMtokOutput: 0.48,
        throughputPerMw: 985000,
        concurrency: 96,
        precision: 'fp8',
        clamped: false,
      },
      b: {
        hardware: 'mi355x',
        configKey: 'mi355x_sglang',
        throughputPerGpu: 1104.7,
        inputThroughputPerGpu: 8455.1,
        outputThroughputPerGpu: 1104.7,
        costPerMtok: 0.47,
        costPerMtokInput: 0.07,
        costPerMtokOutput: 0.53,
        throughputPerMw: 912000,
        concurrency: 88,
        precision: 'fp8',
        clamped: false,
      },
      basis: 'throughputPerGpu',
      deltaPct: 19.1,
      winner: 'b200',
    },
  ],
  summary: {
    a: {
      hardware: 'b200',
      configCount: 12,
      bestThroughputPerGpu: 1840.3,
      bestMedianTtft: 0.42,
      bestMedianTpot: 8.1,
    },
    b: {
      hardware: 'mi355x',
      configCount: 9,
      bestThroughputPerGpu: 1512.8,
      bestMedianTtft: 0.51,
      bestMedianTpot: 9.4,
    },
    headToHead: {
      faster: 'B200',
      slower: 'MI355X',
      tputPct: 19,
      cheaper: 'B200',
      pricier: 'MI355X',
      costPct: 11,
    },
  },
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Head-to-head interpolated table for the GPU pair at the effective scenario and precision, plus per-side summaries.',
      '在生效场景与精度下该 GPU 组合的逐档位插值对比表，以及双方摘要。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'model,scenario,tier,basis,delta_pct,winner,a_hardware,a_throughput_per_gpu,a_cost_per_mtok,a_concurrency,a_clamped,b_hardware,b_throughput_per_gpu,b_cost_per_mtok,b_concurrency,b_clamped\r\nDeepSeek-V4-Pro,agentic-traces,34,throughputPerGpu,19.1,b200,b200,1315.2,0.42,96,false,mi355x,1104.7,0.47,88,false',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'The slug, model, gpus, scenario, variant, tiers, or format value is invalid. The body names the parameter and lists the allowed values where applicable.',
      'slug、model、gpus、scenario、variant、tiers 或 format 参数无效。响应体会指出参数名，并在适用时列出允许的取值。',
    ),
    schema: errorSchema,
    example: {
      error:
        'Unknown compare slug: not-a-pair. Expected <model>-<gpuA>-vs-<gpuB>, e.g. deepseek-v4-b200-vs-mi355x.',
      param: 'slug',
    },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The comparison assembly failed.', '对比数据组装失败。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-compare-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/compare',
    summary: text('Get a GPU pair comparison view', '获取 GPU 组合对比视图'),
    description: text(
      'Returns a /compare page as data: for one model and two GPUs, interpolated throughput, cost, and efficiency at each interactivity tier from the same pipeline the page renders, with a per-tier winner and an overall head-to-head summary. Supports custom tiers and per-dollar, precision, and spec-decode variants.',
      '以数据形式返回 /compare 页面：对一个模型和两块 GPU，使用与页面相同的插值管线给出各交互性档位下的吞吐、成本和能效，并标注每档位胜者与整体对比摘要。支持自定义档位以及 per-dollar、precision、spec-decode 变体。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'CompareView',
    curlUrl: `${API_BASE_URL}/api/v1/views/compare?slug=deepseek-v4-b200-vs-mi355x`,
  },
];
