import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL, SUPPORTED_BENCHMARK_MODELS } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/rankings.
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
const nullableBoolean: ApiSchema = { type: ['boolean', 'null'] };
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
    name: 'kind',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Ranking kind: fastest-gpu orders by tok/s per GPU (descending), cheapest-gpu by $/M total tokens (ascending).',
      '排名类型：fastest-gpu 按每 GPU tok/s 降序，cheapest-gpu 按每百万 token 成本升序。',
    ),
    schema: { type: 'string', enum: ['fastest-gpu', 'cheapest-gpu'], default: 'cheapest-gpu' },
    example: 'cheapest-gpu',
  },
  {
    name: 'model',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Display model name (case-insensitive) or compare-page slug. Default: every ranked model; models without measurable rows are dropped there but kept when requested explicitly.',
      '展示模型名称（不区分大小写）或对比页 slug。默认为全部有排名的模型；无可测数据的模型在全量结果中会被省略，显式指定时则保留。',
    ),
    schema: { type: 'string', enum: SUPPORTED_BENCHMARK_MODELS },
    example: 'DeepSeek-V4-Pro',
  },
  {
    name: 'scenario',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Workload scenario. Aliases: 8k-1k for single_turn_8k1k, agentic for agentx. Default: every curated overview scenario per model (the rows the /overview matrix shows).',
      '工作负载场景。别名：8k-1k 对应 single_turn_8k1k，agentic 对应 agentx。默认为每个模型在 /overview 矩阵中精选的全部场景。',
    ),
    schema: { type: 'string', enum: ['single_turn_8k1k', 'agentx', '8k-1k', 'agentic'] },
    example: 'agentx',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Response format. CSV returns one flat row per ranked hardware.',
      '响应格式。CSV 为每个上榜硬件返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'json',
  },
];

const rowSchema = objectSchema({
  rank: integerSchema,
  hardware: stringSchema,
  hardwareLabel: stringSchema,
  chip: nullableString,
  value: nullableNumber,
  unit: { type: 'string', enum: ['tokens_per_second_per_gpu', 'usd_per_million_tokens'] },
  framework: nullableString,
  precision: nullableString,
  disagg: nullableBoolean,
});

const responseSchema: ApiSchema = objectSchema({
  view: { type: 'string', enum: ['rankings'] },
  apiVersion: { type: 'string', enum: ['v1'] },
  generatedAt: { ...nullableString, format: 'date' },
  params: objectSchema({
    kind: stringSchema,
    model: stringSchema,
    scenario: stringSchema,
    tier: integerSchema,
    engine: stringSchema,
    format: { type: 'string', enum: ['json', 'csv'] },
  }),
  kind: { type: 'string', enum: ['fastest-gpu', 'cheapest-gpu'] },
  tier: integerSchema,
  entries: arraySchema(
    objectSchema({
      model: stringSchema,
      modelSlug: stringSchema,
      modelLabel: stringSchema,
      scenario: { type: 'string', enum: ['single_turn_8k1k', 'agentx'] },
      rows: arraySchema(rowSchema),
    }),
  ),
});

const responseExample = {
  view: 'rankings',
  apiVersion: 'v1',
  generatedAt: '2026-08-20',
  params: {
    kind: 'cheapest-gpu',
    model: 'DeepSeek-V4-Pro',
    scenario: 'agentx',
    tier: 50,
    engine: 'community',
    format: 'json',
  },
  kind: 'cheapest-gpu',
  tier: 50,
  entries: [
    {
      model: 'DeepSeek-V4-Pro',
      modelSlug: 'deepseek-v4',
      modelLabel: 'DeepSeekv4 Pro 0813 1.6T',
      scenario: 'agentx',
      rows: [
        {
          rank: 1,
          hardware: 'b200',
          hardwareLabel: 'B200',
          chip: 'b200',
          value: 0.42,
          unit: 'usd_per_million_tokens',
          framework: 'SGLang',
          precision: 'fp8',
          disagg: true,
        },
      ],
    },
  ],
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Ranked hardware per model-scenario at the primary tier (50 tok/s/user), community engine scope.',
      '主档位（每用户 50 tok/s）、社区引擎范围下，每个「模型-场景」的硬件排名。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'kind,model,model_slug,scenario,tier,rank,hardware,hardware_label,chip,value,unit,framework,precision,disagg\r\ncheapest-gpu,DeepSeek-V4-Pro,deepseek-v4,agentx,50,1,b200,B200,b200,0.42,usd_per_million_tokens,SGLang,fp8,true',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'The kind, model, scenario, or format value is invalid. The body names the parameter and lists the allowed values.',
      'kind、model、scenario 或 format 参数无效。响应体会指出参数名并列出允许的取值。',
    ),
    schema: errorSchema,
    example: {
      error: 'Unknown kind: slowest-gpu',
      param: 'kind',
      allowed: ['fastest-gpu', 'cheapest-gpu'],
    },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The rankings query failed.', '排名数据查询失败。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-rankings-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/rankings',
    summary: text('Get GPU ranking views', '获取 GPU 排名视图'),
    description: text(
      'Returns the /rankings pages as data: per model and scenario, hardware ordered by best community serving config at the primary interactivity tier — fastest-gpu by tok/s per GPU, cheapest-gpu by $/M total tokens. Rows carry the winning framework, precision, and disaggregation flag; chip links each hardware to its /chips registry slug.',
      '以数据形式返回 /rankings 页面：按模型与场景，在主交互性档位下依最优社区推理配置对硬件排序 — fastest-gpu 按每 GPU tok/s，cheapest-gpu 按每百万 token 成本。每行包含胜出的框架、精度和 disagg 标志；芯片字段将各硬件对应到 /chips 注册表中的 slug。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'RankingsView',
    curlUrl: `${API_BASE_URL}/api/v1/views/rankings?kind=cheapest-gpu&model=DeepSeek-V4-Pro&scenario=agentx`,
  },
];
