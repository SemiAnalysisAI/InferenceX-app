import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/reliability.
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
const nullableDateSchema: ApiSchema = { type: ['string', 'null'], format: 'date' };
const objectSchema = (
  properties: Readonly<Record<string, ApiSchema>>,
  required: readonly string[] = Object.keys(properties),
): ApiSchema => ({ type: 'object', properties, required, additionalProperties: false });
const arraySchema = (items: ApiSchema): ApiSchema => ({ type: 'array', items });

const RELIABILITY_RANGE_ENUM = [
  'last-3-days',
  'last-7-days',
  'last-month',
  'last-3-months',
  'all-time',
] as const;

const parameters: readonly ApiParameter[] = [
  {
    name: 'range',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Rolling date-range preset for the aggregation, matching the /reliability dashboard presets.',
      '聚合使用的滚动时间范围预设，与 /reliability 页面的预设一致。',
    ),
    schema: { type: 'string', enum: RELIABILITY_RANGE_ENUM, default: 'last-3-months' },
    example: 'last-7-days',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Response encoding. csv returns one flat row per hardware.',
      '响应编码。csv 为每个硬件返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'json',
  },
];

const responseSchema = objectSchema({
  view: { type: 'string', enum: ['reliability'] },
  apiVersion: { type: 'string', enum: ['v1'] },
  params: objectSchema({
    range: { type: 'string', enum: RELIABILITY_RANGE_ENUM },
    format: { type: 'string', enum: ['json', 'csv'] },
  }),
  range: { type: 'string', enum: RELIABILITY_RANGE_ENUM },
  hardware: arraySchema(
    objectSchema({
      key: stringSchema,
      label: stringSchema,
      successRate: {
        ...numberSchema,
        description: 'Success percentage over the range, rounded to 2 decimal places.',
      },
      successes: integerSchema,
      total: integerSchema,
    }),
  ),
  generatedFrom: objectSchema({
    firstDate: nullableDateSchema,
    lastDate: nullableDateSchema,
  }),
});

const responseExample = {
  view: 'reliability',
  apiVersion: 'v1',
  params: { range: 'last-7-days', format: 'json' },
  range: 'last-7-days',
  hardware: [
    { key: 'h200', label: 'H200', successRate: 93.33, successes: 28, total: 30 },
    { key: 'b200', label: 'B200', successRate: 90, successes: 27, total: 30 },
  ],
  generatedFrom: { firstDate: '2025-11-03', lastDate: '2026-08-26' },
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Aggregated success rates per hardware for the selected range.',
      '所选时间范围内每个硬件的聚合成功率。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example: 'range,key,label,successRate,successes,total\r\nlast-7-days,h200,H200,93.33,28,30',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'The range or format value is invalid. The body lists the allowed values.',
      'range 或 format 参数无效。响应体会列出允许的取值。',
    ),
    schema: {
      type: 'object',
      properties: { error: stringSchema },
      required: ['error'],
      additionalProperties: true,
    },
    example: {
      error: 'Unknown range: last-year',
      param: 'range',
      allowed: RELIABILITY_RANGE_ENUM,
    },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The reliability query failed.', '可靠性数据查询失败。'),
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
    id: 'get-reliability-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/reliability',
    summary: text('Get the reliability chart view', '获取可靠性图表视图'),
    description: text(
      'Returns the aggregated benchmark-run success rates per hardware that the /reliability dashboard chart renders, bucketed by a rolling date-range preset. Success rates are percentages rounded to 2 decimal places; generatedFrom reports the first and last dates in the underlying run stats.',
      '返回 /reliability 页面图表渲染的各硬件基准运行成功率聚合结果，按滚动时间范围预设分桶。成功率为百分比，保留 2 位小数；generatedFrom 给出底层运行统计数据的最早与最晚日期。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'ReliabilityView',
    curlUrl: `${API_BASE_URL}/api/v1/views/reliability?range=last-7-days&format=json`,
  },
];
