import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/options.
 *
 * Assembled into the registry by the coordinator — this module only exports
 * `operations`. The `views` group id is added to `ApiGroupId` during that
 * integration, hence the local cast below.
 */

const VIEWS_GROUP: ApiOperation['group'] = 'views';

const text = (en: string, zh: string): BilingualText => ({ en, zh });
const stringSchema: ApiSchema = { type: 'string' };
const numberSchema: ApiSchema = { type: 'number' };
const booleanSchema: ApiSchema = { type: 'boolean' };
const nullableStringSchema: ApiSchema = { type: ['string', 'null'] };
const objectSchema = (
  properties: Readonly<Record<string, ApiSchema>>,
  required: readonly string[] = Object.keys(properties),
): ApiSchema => ({ type: 'object', properties, required, additionalProperties: false });
const arraySchema = (items: ApiSchema): ApiSchema => ({ type: 'array', items });

const parameters: readonly ApiParameter[] = [
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Response encoding. This discovery endpoint is JSON-only.',
      '响应编码。该发现端点仅支持 JSON。',
    ),
    schema: { type: 'string', enum: ['json'], default: 'json' },
    example: 'json',
  },
];

const responseSchema = objectSchema(
  {
    view: { type: 'string', enum: ['options'] },
    apiVersion: { type: 'string', enum: ['v1'] },
    params: objectSchema({ format: { type: 'string', enum: ['json'] } }),
    models: arraySchema(
      objectSchema({
        name: stringSchema,
        dbKeys: arraySchema(stringSchema),
        category: stringSchema,
        releaseDate: nullableStringSchema,
        compareSlug: nullableStringSchema,
      }),
    ),
    sequences: arraySchema(
      objectSchema({
        key: stringSchema,
        label: stringSchema,
        labelZh: stringSchema,
        urlSegment: nullableStringSchema,
        isl: { type: ['integer', 'null'] },
        osl: { type: ['integer', 'null'] },
        kind: stringSchema,
        deprecated: booleanSchema,
      }),
    ),
    precisions: arraySchema(stringSchema),
    hardware: arraySchema(
      objectSchema({
        key: stringSchema,
        label: stringSchema,
        vendor: stringSchema,
        arch: stringSchema,
        tdpW: numberSchema,
        costPerHour: objectSchema({ h: numberSchema, n: numberSchema, r: numberSchema }),
      }),
    ),
    frameworks: arraySchema(
      objectSchema({ key: stringSchema, label: stringSchema, family: nullableStringSchema }),
    ),
    specMethods: arraySchema(stringSchema),
    percentiles: arraySchema(stringSchema),
    xAxisModes: arraySchema(stringSchema),
    scaleModes: arraySchema(stringSchema),
    metrics: arraySchema(
      objectSchema({
        key: stringSchema,
        configKey: stringSchema,
        label: stringSchema,
        labelZh: stringSchema,
        unit: nullableStringSchema,
        polarity: nullableStringSchema,
        group: nullableStringSchema,
        source: stringSchema,
      }),
    ),
    quickFilters: objectSchema({
      vendors: arraySchema(stringSchema),
      frameworkFamilies: arraySchema(stringSchema),
      deployments: arraySchema(stringSchema),
      specModes: arraySchema(stringSchema),
    }),
    reliabilityRanges: arraySchema(stringSchema),
    overview: { type: 'object', additionalProperties: true },
    calculator: { type: 'object', additionalProperties: true },
    fleet: { type: 'object', additionalProperties: true },
    defaults: { type: 'object', additionalProperties: true },
  },
  [
    'view',
    'apiVersion',
    'params',
    'models',
    'sequences',
    'precisions',
    'hardware',
    'frameworks',
    'metrics',
    'defaults',
  ],
);

const responseExample = {
  view: 'options',
  apiVersion: 'v1',
  params: { format: 'json' },
  models: [
    {
      name: 'DeepSeek-V4-Pro',
      dbKeys: ['dsv4'],
      category: 'default',
      releaseDate: '2026-06-30',
      compareSlug: 'deepseek-v4-pro',
    },
  ],
  sequences: [
    {
      key: '8k/1k',
      label: '8k/1k',
      labelZh: '8k/1k',
      urlSegment: '8k-1k',
      isl: 8192,
      osl: 1024,
      kind: 'fixed',
      deprecated: false,
    },
  ],
  precisions: ['fp4', 'fp4fp8', 'fp8', 'bf16', 'int4'],
  hardware: [
    {
      key: 'h200',
      label: 'H200',
      vendor: 'NVIDIA',
      arch: 'Hopper',
      tdpW: 700,
      costPerHour: { h: 2.29, n: 2.99, r: 3.11 },
    },
  ],
  frameworks: [{ key: 'trt', label: 'TRTLLM', family: 'trt' }],
  specMethods: ['mtp', 'none'],
  percentiles: ['p75', 'p90'],
  xAxisModes: ['interactivity', 'ttft', 'e2e', 'e2e-normalized-interactivity'],
  scaleModes: ['auto', 'linear', 'log'],
  metrics: [
    {
      key: 'tokensPerDollarN',
      configKey: 'y_tokensPerDollarN',
      label: 'Tokens per Dollar (Neocloud)',
      labelZh: '每美元 Token 数（Neocloud）',
      unit: null,
      polarity: 'higher',
      group: 'Cost',
      source: 'benchmark',
    },
  ],
  quickFilters: {
    vendors: ['NVIDIA', 'AMD'],
    frameworkFamilies: ['vllm', 'sglang', 'trt', 'atom'],
    deployments: ['single-node', 'multi-node', 'disagg'],
    specModes: ['mtp', 'stp'],
  },
  reliabilityRanges: ['last-3-days', 'last-7-days', 'last-month', 'last-3-months', 'all-time'],
  defaults: {
    model: 'DeepSeek-V4-Pro',
    sequence: '8k/1k',
    metric: 'y_tokensPerDollarN',
    percentile: 'p90',
    xmode: 'interactivity',
  },
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Every option domain the views endpoints accept, plus dashboard-parity defaults.',
      '各 views 端点接受的全部选项域，以及与仪表盘一致的默认值。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
  },
  {
    status: '400',
    description: text(
      'The format value is invalid — this endpoint is JSON-only.',
      'format 参数无效——该端点仅支持 JSON。',
    ),
    schema: {
      type: 'object',
      properties: { error: stringSchema },
      required: ['error'],
      additionalProperties: true,
    },
    example: { error: 'Unsupported format: csv', param: 'format', allowed: ['json'] },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('Option assembly failed.', '选项数据组装失败。'),
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
    id: 'get-view-options',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/options',
    summary: text('Discover every views-API option domain', '获取 views API 的全部选项域'),
    description: text(
      'Static discovery endpoint for the views API: models (with DB keys, category and release date), sequences, precisions, hardware (with vendor, architecture, TDP and per-provider hourly cost), frameworks, speculative-decoding methods, percentiles, x-axis and scale modes, chart metrics (bilingual labels, unit, polarity), quick-filter domains, reliability ranges, and overview/calculator/fleet option sets — plus the defaults the dashboard itself uses. Values come from the same registries the dashboard renders its controls from, so this response is the authoritative input catalog for the other /api/v1/views endpoints. No database access.',
      'views API 的静态发现端点：模型（含数据库键、分类与发布日期）、序列、精度、硬件（含厂商、架构、TDP 及各供应商每小时成本）、推理框架、投机解码方法、百分位、x 轴与坐标缩放模式、图表指标（中英文标签、单位、极性）、快捷筛选域、可靠性时间范围，以及 overview/calculator/fleet 的选项集，并附仪表盘实际使用的默认值。所有取值直接来自仪表盘控件渲染所用的注册表，因此该响应是其余 /api/v1/views 端点的权威输入目录。不访问数据库。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'ViewOptions',
    curlUrl: `${API_BASE_URL}/api/v1/views/options`,
  },
];
