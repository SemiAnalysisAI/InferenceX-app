import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL, SUPPORTED_BENCHMARK_MODELS } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/evaluation.
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
    name: 'model',
    location: 'query',
    required: true,
    type: 'string',
    description: text(
      'Display model name (case-insensitive) or compare-page slug.',
      '展示模型名称（不区分大小写）或对比页 slug。',
    ),
    schema: { type: 'string', enum: SUPPORTED_BENCHMARK_MODELS },
    example: 'DeepSeek-V4-Pro',
  },
  {
    name: 'benchmark',
    location: 'query',
    required: false,
    type: 'string',
    description: text(
      'Evaluation task key (e.g. gsm8k). Default: the first available benchmark for the model (alphabetical). Unknown values return 400 with the available list.',
      '评测任务键（例如 gsm8k）。默认取该模型可用基准中按字母序的第一个。传入未知值会返回 400，并列出可用基准。',
    ),
    schema: stringSchema,
    example: 'gsm8k',
  },
  {
    name: 'date',
    location: 'query',
    required: false,
    type: 'date',
    description: text(
      'Requested eval run date (YYYY-MM-DD), resolved to the nearest available date like the dashboard. Default: latest available date.',
      '请求的评测运行日期（YYYY-MM-DD），会像页面一样解析到最接近的可用日期。默认使用最新可用日期。',
    ),
    schema: { type: 'string', format: 'date' },
    example: '2026-08-20',
  },
  {
    name: 'precisions',
    location: 'query',
    required: false,
    type: 'CSV list',
    description: text(
      'Comma-separated precision filter (fp4, fp4fp8, fp8, bf16, int4). Default: every precision present in the model’s eval rows.',
      '以逗号分隔的精度过滤（fp4、fp4fp8、fp8、bf16、int4）。默认包含该模型评测数据中出现的全部精度。',
    ),
    schema: stringSchema,
    example: 'fp8',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Response encoding. csv returns one flat row per config with newline-free labels.',
      '响应编码。csv 为每个配置返回一行平面数据，标签中的换行会被展平。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'json',
  },
];

const responseSchema = objectSchema({
  view: { type: 'string', enum: ['evaluation'] },
  apiVersion: { type: 'string', enum: ['v1'] },
  params: objectSchema({
    model: stringSchema,
    benchmark: { type: ['string', 'null'] },
    date: { type: ['string', 'null'], format: 'date' },
    precisions: arraySchema(stringSchema),
    format: { type: 'string', enum: ['json', 'csv'] },
  }),
  benchmarks: arraySchema(stringSchema),
  rows: arraySchema(
    objectSchema({
      hwKey: stringSchema,
      label: stringSchema,
      score: numberSchema,
      stderr: numberSchema,
      n: {
        ...integerSchema,
        description: 'How many repeated runs (retries/reruns) the row averages.',
      },
      precision: stringSchema,
      framework: stringSchema,
      date: { type: 'string', format: 'date' },
    }),
  ),
});

const responseExample = {
  view: 'evaluation',
  apiVersion: 'v1',
  params: {
    model: 'DeepSeek-V4-Pro',
    benchmark: 'gsm8k',
    date: '2026-08-20',
    precisions: ['fp8'],
    format: 'json',
  },
  benchmarks: ['aime25', 'gsm8k'],
  rows: [
    {
      hwKey: 'h200_sglang',
      label: 'H200 (SGLang)\nC128 T8 E1',
      score: 0.85,
      stderr: 0.01,
      n: 2,
      precision: 'fp8',
      framework: 'sglang',
      date: '2026-08-20',
    },
  ],
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Aggregated evaluation chart rows for the resolved model, benchmark, and date.',
      '按解析后的模型、基准和日期聚合的评测图表数据行。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'hwKey,label,score,stderr,n,precision,framework,date\r\nh200_sglang,H200 (SGLang) C128 T8 E1,0.85,0.01,2,fp8,sglang,2026-08-20',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'The model, benchmark, date, precisions, or format value is invalid. The body lists the allowed values.',
      'model、benchmark、date、precisions 或 format 参数无效。响应体会列出允许的取值。',
    ),
    schema: errorSchema,
    example: {
      error: 'Unknown benchmark for DeepSeek-V4-Pro: mmlu',
      param: 'benchmark',
      allowed: ['aime25', 'gsm8k'],
    },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('The evaluation query failed.', '评测数据查询失败。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-evaluation-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/evaluation',
    summary: text('Get the evaluation chart view', '获取评测图表视图'),
    description: text(
      'Returns the aggregated evaluation bars the /evaluation dashboard renders for a model, benchmark, and run date: latest rows per config, with same-config retries averaged into one row (score is the mean; stderr covers the min/max error range; n counts the averaged runs). benchmarks lists every benchmark available for the model.',
      '返回 /evaluation 页面为指定模型、基准和运行日期渲染的聚合评测柱状数据：每个配置取最新数据，同配置的重试合并为一行（score 为平均值，stderr 覆盖最小/最大误差范围，n 为参与平均的运行次数）。benchmarks 列出该模型的全部可用基准。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'EvaluationView',
    curlUrl: `${API_BASE_URL}/api/v1/views/evaluation?model=DeepSeek-V4-Pro&benchmark=gsm8k&format=json`,
  },
];
