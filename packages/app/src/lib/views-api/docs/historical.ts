import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/historical.
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
      'Trend metric key or config key, e.g. tpPerGpu or y_tokensPerDollarN (see options → metrics).',
      '趋势指标键或配置键，如 tpPerGpu 或 y_tokensPerDollarN（见 options → metrics）。',
    ),
    schema: { type: 'string', default: 'y_tokensPerDollarN' },
    example: 'y_tpPerGpu',
  },
  {
    name: 'target',
    location: 'query',
    required: false,
    type: 'number',
    description: text(
      'Target interactivity (tok/s/user) the metric is interpolated at for every snapshot date.',
      '目标交互速率（tok/s/user）：在每个快照日期上按该值对指标插值。',
    ),
    schema: { type: 'number', default: 35, minimum: 1, maximum: 1000 },
    example: '50',
  },
  {
    name: 'precisions',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Comma-separated precisions. When omitted, the densest available precision is auto-selected. With multiple precisions, each hardware gets one line per precision (key hwKey__precision).',
      '逗号分隔的精度列表。省略时按数据最密的精度自动选择。选择多个精度时，每个硬件会按精度分线（键为 hwKey__precision）。',
    ),
    schema: { type: 'string', description: 'Comma-separated list of fp4|fp4fp8|fp8|bf16|int4' },
    example: 'fp8,bf16',
  },
  listParam(
    'gpus',
    text(
      'Comma-separated hardware keys or bare GPU names to include.',
      '逗号分隔的硬件键或 GPU 名称。',
    ),
    'h200,mi355x',
  ),
  listParam('vendors', text('Comma-separated GPU vendors.', '逗号分隔的 GPU 厂商。'), 'AMD', [
    'AMD',
    'NVIDIA',
  ]),
  listParam(
    'frameworks',
    text('Comma-separated framework families.', '逗号分隔的推理框架系列。'),
    'vllm,trt',
    ['atom', 'sglang', 'trt', 'vllm'],
  ),
  listParam(
    'deployment',
    text(
      'Comma-separated deployment modes; agg expands to single-node and multi-node.',
      '逗号分隔的部署模式；agg 会展开为 single-node 与 multi-node。',
    ),
    'single-node',
    ['agg', 'disagg', 'multi-node', 'single-node'],
  ),
  {
    name: 'start',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Earliest snapshot date to include (YYYY-MM-DD).',
      '包含的最早快照日期（YYYY-MM-DD）。',
    ),
    schema: { type: 'string', format: 'date' },
    example: '2026-01-01',
  },
  {
    name: 'end',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Latest snapshot date to include (YYYY-MM-DD).',
      '包含的最晚快照日期（YYYY-MM-DD）。',
    ),
    schema: { type: 'string', format: 'date' },
    example: '2026-08-01',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Response encoding. csv returns one flat row per line point.',
      '响应编码。csv 为每条趋势线的每个点返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'csv',
  },
];

const responseSchema = objectSchema(
  {
    view: { type: 'string', enum: ['historical'] },
    apiVersion: { type: 'string', enum: ['v1'] },
    params: { type: 'object', additionalProperties: true },
    metric: objectSchema({
      key: stringSchema,
      configKey: stringSchema,
      label: stringSchema,
      labelZh: stringSchema,
    }),
    target: numberSchema,
    hwKeysWithData: arraySchema(stringSchema),
    series: arraySchema(
      objectSchema(
        {
          key: stringSchema,
          hwKey: stringSchema,
          precision: { type: ['string', 'null'] },
          label: stringSchema,
          vendor: { type: ['string', 'null'] },
          points: arraySchema(
            objectSchema(
              {
                date: { type: 'string', format: 'date' },
                value: numberSchema,
                synthetic: booleanSchema,
              },
              ['date', 'value'],
            ),
          ),
        },
        ['key', 'hwKey', 'label', 'points'],
      ),
    ),
    count: integerSchema,
  },
  ['view', 'apiVersion', 'params', 'metric', 'target', 'hwKeysWithData', 'series', 'count'],
);

const responseExample = {
  view: 'historical',
  apiVersion: 'v1',
  params: {
    model: 'DeepSeek-V4-Pro',
    sequence: '8k/1k',
    metric: 'y_tpPerGpu',
    target: 35,
    precisions: ['fp8'],
    gpus: [],
    vendors: [],
    frameworks: [],
    deployment: [],
    start: null,
    end: null,
    format: 'json',
  },
  metric: {
    key: 'tpPerGpu',
    configKey: 'y_tpPerGpu',
    label: 'Output Throughput per GPU (tok/s/gpu)',
    labelZh: '单 GPU 输出吞吐（tok/s/gpu）',
  },
  target: 35,
  hwKeysWithData: ['h200_trt'],
  series: [
    {
      key: 'h200_trt',
      hwKey: 'h200_trt',
      precision: null,
      label: 'H200 (TRTLLM)',
      vendor: 'NVIDIA',
      points: [
        { date: '2026-07-01', value: 310.4 },
        { date: '2026-08-20', value: 355.2 },
        { date: '2026-08-25', value: 355.2, synthetic: true },
      ],
    },
  ],
  count: 3,
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Date-sorted trend lines per hardware config, interpolated at the target interactivity.',
      '按硬件配置给出的按日期排序趋势线，在目标交互速率处插值。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'key,hwKey,precision,label,vendor,date,value,synthetic\r\nh200_trt,h200_trt,,H200 (TRTLLM),NVIDIA,2026-07-01,310.4,false',
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
    example: { error: 'target must be >= 1', param: 'target' },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The benchmark history query failed.', '历史基准数据查询失败。'),
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
    id: 'get-historical-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/historical',
    summary: text('Get the historical trends view', '获取历史趋势视图'),
    description: text(
      'Returns the Historical Trends dashboard lines computed server-side: for every benchmark snapshot date, the selected metric is interpolated at the target interactivity per hardware config (per precision when several are selected), then assembled into date-sorted trend lines. Interpolation uses the same monotone-spline math as the dashboard. Lines that end before the latest snapshot date are extended with a synthetic copy of their last value (marked synthetic: true); unlike the dashboard, extension stops at the latest data date rather than wall-clock today, so responses are cache-stable.',
      '返回服务端计算的 Historical Trends 仪表盘趋势线：在每个基准快照日期上，对每个硬件配置（选择多个精度时按精度分线）在目标交互速率处对所选指标插值，再组装为按日期排序的趋势线。插值与仪表盘使用相同的单调样条数学。早于最新快照日期结束的线会以最后一个值补出合成点（标记 synthetic: true）；与仪表盘不同，补线止于数据中的最新日期而非当前日期，从而保证响应可稳定缓存。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'HistoricalView',
    curlUrl: `${API_BASE_URL}/api/v1/views/historical?model=DeepSeek-V4-Pro&metric=y_tpPerGpu&target=35`,
  },
];
