import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/overview.
 *
 * Assembled into the registry by the coordinator — this module only exports
 * `operations`. The `views` group id is added to `ApiGroupId` during that
 * integration, hence the local cast below.
 */

const VIEWS_GROUP: ApiOperation['group'] = 'views';

const text = (en: string, zh: string): BilingualText => ({ en, zh });
const stringSchema: ApiSchema = { type: 'string' };
const integerSchema: ApiSchema = { type: 'integer' };
const nullableString: ApiSchema = { type: ['string', 'null'] };
const nullableNumber: ApiSchema = { type: ['number', 'null'] };
const booleanSchema: ApiSchema = { type: 'boolean' };
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
    name: 'tier',
    location: 'query',
    required: false,
    type: 'integer',
    description: text(
      'Interactivity tier in output tokens per second per user. Cells are read at this tier.',
      '交互性档位，单位为每用户每秒输出 token。所有单元格按该档位读取。',
    ),
    schema: { type: 'integer', enum: [30, 50, 75, 100, 150, 200], default: 50 },
    example: 50,
  },
  {
    name: 'engine',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Serving-engine scope: community frameworks only, or all engines including vendor stacks.',
      '推理引擎范围：仅社区框架，或包含厂商自研栈在内的全部引擎。',
    ),
    schema: { type: 'string', enum: ['community', 'all'], default: 'community' },
    example: 'community',
  },
  {
    name: 'compare',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Comparison mode: hardware compares each cell against the reference GPU; a window (7d/30d/60d/90d) compares against the same cell that many days earlier.',
      '对比模式：hardware 表示与参照 GPU 对比；7d/30d/60d/90d 表示与相应天数之前的同一单元格对比。',
    ),
    schema: { type: 'string', enum: ['hardware', '7d', '30d', '60d', '90d'], default: 'hardware' },
    example: 'hardware',
  },
  {
    name: 'ref',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Reference GPU for compare=hardware deltas.',
      'compare=hardware 时用于计算差值的参照 GPU。',
    ),
    schema: { type: 'string', enum: ['b200', 'mi355x', 'b300', 'gb200', 'gb300'], default: 'b200' },
    example: 'b200',
  },
  {
    name: 'models',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Model scope: the curated default set or every model with data.',
      '模型范围：默认精选集合，或全部有数据的模型。',
    ),
    schema: { type: 'string', enum: ['default', 'all'], default: 'default' },
    example: 'default',
  },
  {
    name: 'rows',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Row scope for historical windows: only rows that changed inside the window, or all rows.',
      '历史窗口下的行范围：仅窗口内发生变化的行，或全部行。',
    ),
    schema: { type: 'string', enum: ['changed', 'all'], default: 'all' },
    example: 'all',
  },
  {
    name: 'hwrows',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Hardware-cell scope: only cells with a priced measurement, or all hardware columns.',
      '硬件单元格范围：仅有定价测量值的单元格，或全部硬件列。',
    ),
    schema: { type: 'string', enum: ['priced', 'all'], default: 'all' },
    example: 'all',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Response format. CSV returns one flat row per model-scenario-hardware cell.',
      '响应格式。CSV 为每个「模型-场景-硬件」单元格返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'json',
  },
];

const configSchema: ApiSchema = {
  type: ['object', 'null'],
  properties: {
    framework: stringSchema,
    frameworkLabel: stringSchema,
    precision: stringSchema,
    specMethod: stringSchema,
    specLabel: nullableString,
    disagg: booleanSchema,
    multinode: booleanSchema,
    latestDate: nullableString,
  },
  additionalProperties: false,
};

const cellSchema = objectSchema(
  {
    hardware: stringSchema,
    hardwareLabel: stringSchema,
    costPerMtok: nullableNumber,
    throughputPerGpu: nullableNumber,
    estimated: booleanSchema,
    deltaVsRefPct: nullableNumber,
    missingReason: nullableString,
    config: configSchema,
    history: {
      type: 'object',
      properties: {
        status: stringSchema,
        baselineCostPerMtok: nullableNumber,
        costDeltaPct: nullableNumber,
        baselineDate: nullableString,
      },
      additionalProperties: false,
    },
  },
  [
    'hardware',
    'hardwareLabel',
    'costPerMtok',
    'throughputPerGpu',
    'estimated',
    'deltaVsRefPct',
    'missingReason',
    'config',
  ],
);

const responseSchema: ApiSchema = objectSchema({
  view: { type: 'string', enum: ['overview'] },
  apiVersion: { type: 'string', enum: ['v1'] },
  generatedAt: { ...nullableString, format: 'date' },
  params: objectSchema({
    tier: integerSchema,
    engine: stringSchema,
    compare: stringSchema,
    ref: stringSchema,
    models: stringSchema,
    rows: stringSchema,
    hwrows: stringSchema,
    format: { type: 'string', enum: ['json', 'csv'] },
  }),
  tiers: arraySchema(integerSchema),
  scenarios: arraySchema(stringSchema),
  referenceHardware: stringSchema,
  historicalWindow: {
    type: ['object', 'null'],
    properties: {
      key: stringSchema,
      snapshotDate: stringSchema,
      targetDate: stringSchema,
      earliestDate: stringSchema,
    },
    additionalProperties: true,
  },
  unchangedRowCount: integerSchema,
  emptyRowCount: integerSchema,
  rows: arraySchema(
    objectSchema({
      model: stringSchema,
      modelLabel: stringSchema,
      category: stringSchema,
      scenario: { type: 'string', enum: ['single_turn_8k1k', 'agentx'] },
      cells: arraySchema(cellSchema),
    }),
  ),
});

const responseExample = {
  view: 'overview',
  apiVersion: 'v1',
  generatedAt: '2026-08-20',
  params: {
    tier: 50,
    engine: 'community',
    compare: 'hardware',
    ref: 'b200',
    models: 'default',
    rows: 'all',
    hwrows: 'all',
    format: 'json',
  },
  tiers: [30, 50, 75, 100, 150, 200],
  scenarios: ['single_turn_8k1k', 'agentx'],
  referenceHardware: 'b200',
  historicalWindow: null,
  unchangedRowCount: 0,
  emptyRowCount: 0,
  rows: [
    {
      model: 'DeepSeek-V4-Pro',
      modelLabel: 'DeepSeekv4 Pro 0813 1.6T',
      category: 'frontier',
      scenario: 'agentx',
      cells: [
        {
          hardware: 'b200',
          hardwareLabel: 'B200',
          costPerMtok: 0.42,
          throughputPerGpu: 1315.2,
          estimated: false,
          deltaVsRefPct: null,
          missingReason: null,
          config: {
            framework: 'sglang',
            frameworkLabel: 'SGLang',
            precision: 'fp8',
            specMethod: 'mtp',
            specLabel: 'MTP',
            disagg: true,
            multinode: false,
            latestDate: '2026-08-20',
          },
        },
      ],
    },
  ],
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'The overview cost matrix at the requested tier: one row per model-scenario, one cell per hardware column.',
      '请求档位下的总览成本矩阵：每个「模型-场景」一行，每个硬件列一个单元格。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'model,scenario,tier,hardware,cost_per_mtok,throughput_per_gpu,estimated,delta_vs_ref_pct,missing_reason,framework,precision,spec_method,disagg,multinode,history_status,baseline_cost_per_mtok,history_delta_pct,baseline_date\r\nDeepSeek-V4-Pro,agentx,50,b200,0.42,1315.2,false,,,SGLang,fp8,mtp,true,false,,,,',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'A parameter value is invalid. The body names the parameter and lists the allowed values.',
      '参数无效。响应体会指出参数名并列出允许的取值。',
    ),
    schema: errorSchema,
    example: {
      error: 'Unknown tier: 42',
      param: 'tier',
      allowed: ['30', '50', '75', '100', '150', '200'],
    },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The overview assembly failed.', '总览数据组装失败。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-overview-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/overview',
    summary: text('Get the overview cost matrix view', '获取总览成本矩阵视图'),
    description: text(
      'Returns the /overview dashboard matrix as data: for every curated model-scenario row, the best community (or all-engine) serving config per hardware at the requested interactivity tier, with $/M tokens, tok/s per GPU, deltas versus a reference GPU or a historical window, and the winning config. Unlike the page, invalid parameters return 400 rather than being silently normalized.',
      '以数据形式返回 /overview 页面的矩阵：对每个精选「模型-场景」行，给出各硬件在请求交互性档位下最优的社区（或全部引擎）推理配置，包含每百万 token 成本、每 GPU 吞吐、相对参照 GPU 或历史窗口的差值，以及胜出配置。与页面不同，无效参数会返回 400，而不是被静默归一化。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'OverviewView',
    curlUrl: `${API_BASE_URL}/api/v1/views/overview?tier=50&engine=community&compare=hardware&ref=b200`,
  },
];
