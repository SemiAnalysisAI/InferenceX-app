import { DB_MODEL_TO_DISPLAY, DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { COLLECTIVEX_VERSIONS } from '@semianalysisai/inferencex-db/collectivex/types';

export type ApiDocumentationLocale = 'en' | 'zh';
export type ApiGroupId = 'core' | 'external' | 'datasets' | 'collectivex' | 'diagnostics';
export type ApiHttpMethod = 'GET';
export type ApiParameterLocation = 'path' | 'query';
export type ApiAudience = 'public';
export type ApiStability = 'stable' | 'beta';
export type BilingualText = Readonly<{ en: string; zh: string }>;

type JsonSchemaType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

export interface ApiSchema {
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly format?: string;
  readonly description?: string;
  readonly enum?: readonly (boolean | number | string)[];
  readonly default?: boolean | number | string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly items?: ApiSchema;
  readonly properties?: Readonly<Record<string, ApiSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | ApiSchema;
  readonly oneOf?: readonly ApiSchema[];
}

export interface ApiParameter {
  readonly name: string;
  readonly location: ApiParameterLocation;
  readonly required: boolean;
  readonly type: string;
  readonly description: BilingualText;
  readonly schema: ApiSchema;
  readonly example: boolean | number | string;
}

export interface ApiResponseRepresentation {
  readonly mediaType: 'application/json' | 'text/csv';
  readonly schema: ApiSchema;
  readonly example: unknown;
}

export interface ApiResponse {
  readonly status: `${number}`;
  readonly description: BilingualText;
  readonly schema: ApiSchema;
  readonly example: unknown;
  readonly mediaType?: 'application/json' | 'text/csv';
  readonly alternateRepresentations?: readonly ApiResponseRepresentation[];
}

export interface ApiOperation {
  readonly id: string;
  readonly group: ApiGroupId;
  readonly method: ApiHttpMethod;
  readonly path: string;
  readonly summary: BilingualText;
  readonly description: BilingualText;
  readonly audience: ApiAudience;
  readonly stability: ApiStability;
  readonly parameters: readonly ApiParameter[];
  readonly responses: readonly ApiResponse[];
  readonly responseShapeName: string;
  readonly curlUrl: string;
}

export interface LocalizedApiParameter extends Omit<ApiParameter, 'description'> {
  readonly description: string;
}

export interface LocalizedApiResponse extends Omit<ApiResponse, 'description'> {
  readonly description: string;
}

export interface LocalizedApiOperation extends Omit<
  ApiOperation,
  'description' | 'parameters' | 'responses' | 'summary'
> {
  readonly summary: string;
  readonly description: string;
  readonly parameters: readonly LocalizedApiParameter[];
  readonly responses: readonly LocalizedApiResponse[];
}

export interface ApiDocumentationGroup {
  readonly id: ApiGroupId;
  readonly title: BilingualText;
  readonly description: BilingualText;
}

export interface OpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: Readonly<Record<string, unknown>>;
  readonly servers: readonly Readonly<Record<string, unknown>>[];
  readonly externalDocs: Readonly<Record<string, unknown>>;
  readonly tags: readonly Readonly<Record<string, unknown>>[];
  readonly paths: Readonly<Record<string, unknown>>;
  readonly components: Readonly<{ schemas: Readonly<Record<string, ApiSchema>> }>;
}

export const API_BASE_URL = 'https://inferencex.semianalysis.com' as const;
export const API_VERSION = 'v1' as const;
export const OPENAPI_VERSION = '3.1.0' as const;
export const API_DOCUMENT_VERSION = '1.0.0' as const;
export const OPENAPI_DISPLAY_VERSION = 'OpenAPI 3.1' as const;
export const OPENAPI_DOCUMENT_URL = '/api/openapi.json' as const;

export const SUPPORTED_BENCHMARK_MODELS = Object.freeze(
  Object.keys(DISPLAY_MODEL_TO_DB).toSorted(),
);
export const SUPPORTED_TCO_MODELS = Object.freeze(
  [...new Set([...Object.keys(DB_MODEL_TO_DISPLAY), ...SUPPORTED_BENCHMARK_MODELS])].toSorted(),
);

const text = (en: string, zh: string): BilingualText => ({ en, zh });
const stringSchema: ApiSchema = { type: 'string' };
const numberSchema: ApiSchema = { type: 'number' };
const integerSchema: ApiSchema = { type: 'integer' };
const booleanSchema: ApiSchema = { type: 'boolean' };
const nullableStringSchema: ApiSchema = { type: ['string', 'null'] };
const nullableNumberSchema: ApiSchema = { type: ['number', 'null'] };
const metricMapSchema: ApiSchema = { type: 'object', additionalProperties: numberSchema };
const anyObjectSchema: ApiSchema = { type: 'object', additionalProperties: true };
const errorSchema: ApiSchema = {
  type: 'object',
  properties: { error: stringSchema },
  required: ['error'],
  additionalProperties: true,
};

const objectSchema = (
  properties: Readonly<Record<string, ApiSchema>>,
  required: readonly string[] = Object.keys(properties),
): ApiSchema => ({ type: 'object', properties, required, additionalProperties: false });
const objectSchemaWithOptional = (
  properties: Readonly<Record<string, ApiSchema>>,
  optional: readonly string[],
): ApiSchema =>
  objectSchema(
    properties,
    Object.keys(properties).filter((property) => !optional.includes(property)),
  );
const arraySchema = (items: ApiSchema): ApiSchema => ({ type: 'array', items });
const mapSchema = (items: ApiSchema): ApiSchema => ({
  type: 'object',
  additionalProperties: items,
});

const parameter = (
  name: string,
  location: ApiParameterLocation,
  required: boolean,
  type: string,
  en: string,
  zh: string,
  schema: ApiSchema,
  example: boolean | number | string,
): ApiParameter => ({ name, location, required, type, description: text(en, zh), schema, example });

const success = (
  en: string,
  zh: string,
  schema: ApiSchema,
  example: unknown,
  alternateRepresentations?: readonly ApiResponseRepresentation[],
): ApiResponse => ({
  status: '200',
  description: text(en, zh),
  schema,
  example,
  mediaType: 'application/json',
  alternateRepresentations,
});

const errorResponse = (
  status: `${number}`,
  en: string,
  zh: string,
  error: string,
): ApiResponse => ({
  status,
  description: text(en, zh),
  schema: errorSchema,
  example: { error },
  mediaType: 'application/json',
});

const workerPowerSchema = objectSchemaWithOptional(
  {
    role: stringSchema,
    worker_idx: integerSchema,
    hosts: arraySchema(stringSchema),
    num_gpus: integerSchema,
    avg_power_w: numberSchema,
    avg_temp_c: numberSchema,
    peak_temp_c: numberSchema,
    avg_util_pct: numberSchema,
    avg_mem_used_mb: numberSchema,
  },
  ['hosts', 'avg_temp_c', 'peak_temp_c', 'avg_util_pct', 'avg_mem_used_mb'],
);

const benchmarkRowSchema = objectSchemaWithOptional(
  {
    id: integerSchema,
    hardware: stringSchema,
    framework: stringSchema,
    model: stringSchema,
    precision: stringSchema,
    spec_method: stringSchema,
    disagg: booleanSchema,
    is_multinode: booleanSchema,
    prefill_tp: integerSchema,
    prefill_ep: integerSchema,
    prefill_dp_attention: booleanSchema,
    prefill_num_workers: integerSchema,
    decode_tp: integerSchema,
    decode_ep: integerSchema,
    decode_dp_attention: booleanSchema,
    decode_num_workers: integerSchema,
    num_prefill_gpu: integerSchema,
    num_decode_gpu: integerSchema,
    benchmark_type: stringSchema,
    isl: nullableNumberSchema,
    osl: nullableNumberSchema,
    conc: integerSchema,
    offload_mode: stringSchema,
    image: nullableStringSchema,
    metrics: metricMapSchema,
    workers: arraySchema(workerPowerSchema),
    date: { type: 'string', format: 'date' },
    workflow_run_id: integerSchema,
    run_started_at: { type: ['string', 'null'], format: 'date-time' },
    run_url: nullableStringSchema,
  },
  ['workers', 'workflow_run_id', 'run_started_at'],
);
const benchmarkRowsSchema = arraySchema(benchmarkRowSchema);
const benchmarkExample = [
  {
    id: 421,
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: 'vllm/vllm-openai:v0.10.2',
    metrics: { median_ttft: 0.42, median_tpot: 0.018, tput_per_gpu: 128.4 },
    date: '2026-08-08',
    run_url: 'https://github.com/semianalysis/inference-benchmarks/actions/runs/123456789',
  },
];

const availabilitySchema = arraySchema(
  objectSchema({
    model: stringSchema,
    isl: nullableNumberSchema,
    osl: nullableNumberSchema,
    precision: stringSchema,
    hardware: stringSchema,
    framework: stringSchema,
    spec_method: stringSchema,
    disagg: booleanSchema,
    benchmark_type: stringSchema,
    date: { type: 'string', format: 'date' },
  }),
);
const evaluationsSchema = arraySchema(
  objectSchema({
    id: integerSchema,
    config_id: integerSchema,
    hardware: stringSchema,
    framework: stringSchema,
    model: stringSchema,
    precision: stringSchema,
    spec_method: stringSchema,
    disagg: booleanSchema,
    is_multinode: booleanSchema,
    prefill_tp: integerSchema,
    prefill_ep: integerSchema,
    prefill_dp_attention: booleanSchema,
    prefill_num_workers: integerSchema,
    decode_tp: integerSchema,
    decode_ep: integerSchema,
    decode_dp_attention: booleanSchema,
    decode_num_workers: integerSchema,
    num_prefill_gpu: integerSchema,
    num_decode_gpu: integerSchema,
    task: stringSchema,
    date: { type: 'string', format: 'date' },
    conc: nullableNumberSchema,
    metrics: metricMapSchema,
    timestamp: { type: 'string', format: 'date-time' },
    run_url: nullableStringSchema,
  }),
);
const workflowInfoSchema = objectSchema({
  runs: arraySchema(
    objectSchema({
      github_run_id: integerSchema,
      name: stringSchema,
      conclusion: nullableStringSchema,
      run_attempt: integerSchema,
      html_url: nullableStringSchema,
      created_at: { type: 'string', format: 'date-time' },
      date: { type: 'string', format: 'date' },
    }),
  ),
  changelogs: arraySchema(anyObjectSchema),
  configs: arraySchema(anyObjectSchema),
  runConfigs: arraySchema(anyObjectSchema),
});
const reliabilitySchema = arraySchema(
  objectSchema({
    hardware: stringSchema,
    date: { type: 'string', format: 'date' },
    n_success: integerSchema,
    total: integerSchema,
  }),
);
const tcoFeedSchema: ApiSchema = {
  oneOf: [
    objectSchema({
      model: stringSchema,
      db_model_keys: arraySchema(stringSchema),
      date: { type: ['string', 'null'], format: 'date' },
      workloads: arraySchema(stringSchema),
      tiers: arraySchema(numberSchema),
      rows: arraySchema(anyObjectSchema),
    }),
    objectSchema({
      model: stringSchema,
      db_model_keys: arraySchema(stringSchema),
      date: { type: ['string', 'null'], format: 'date' },
      workloads: arraySchema(stringSchema),
      tiers: arraySchema(numberSchema),
      weights: arraySchema(numberSchema),
      workload_weights: arraySchema(numberSchema),
      alpha: numberSchema,
      rows: arraySchema(anyObjectSchema),
    }),
  ],
};
const submissionsSchema = objectSchema({
  summary: arraySchema(
    objectSchema({
      model: stringSchema,
      hardware: stringSchema,
      framework: stringSchema,
      precision: stringSchema,
      spec_method: stringSchema,
      disagg: booleanSchema,
      is_multinode: booleanSchema,
      num_prefill_gpu: integerSchema,
      num_decode_gpu: integerSchema,
      date: { type: 'string', format: 'date' },
      total_datapoints: integerSchema,
      distinct_sequences: integerSchema,
      distinct_concurrencies: integerSchema,
      max_concurrency: integerSchema,
      image: nullableStringSchema,
    }),
  ),
  volume: arraySchema(
    objectSchema({
      date: { type: 'string', format: 'date' },
      hardware: stringSchema,
      datapoints: integerSchema,
    }),
  ),
});
const latestImagesSchema = arraySchema(
  objectSchema({
    model: stringSchema,
    hardware: stringSchema,
    framework: stringSchema,
    precision: stringSchema,
    spec_method: stringSchema,
    disagg: booleanSchema,
    isl: integerSchema,
    osl: integerSchema,
    image: stringSchema,
    date: { type: 'string', format: 'date' },
  }),
);
const datasetRecordSchema = objectSchema({
  id: stringSchema,
  slug: stringSchema,
  label: stringSchema,
  variant: stringSchema,
  description: nullableStringSchema,
  hf_url: nullableStringSchema,
  license: nullableStringSchema,
  conversation_count: integerSchema,
  summary: anyObjectSchema,
  ingested_at: { type: 'string', format: 'date-time' },
});
const conversationItemSchema = objectSchema({
  conv_id: stringSchema,
  models: arraySchema(stringSchema),
  num_turns: integerSchema,
  num_subagent_groups: integerSchema,
  total_in: integerSchema,
  total_out: integerSchema,
  total_cached: integerSchema,
});
const collectiveXDatasetSchema = objectSchema(
  {
    version: integerSchema,
    run: objectSchema({
      run_id: stringSchema,
      run_attempt: integerSchema,
      generated_at: { type: 'string', format: 'date-time' },
      conclusion: nullableStringSchema,
      source_sha: stringSchema,
      requested_cases: integerSchema,
      terminal_cases: integerSchema,
      measured_cases: integerSchema,
      unsupported_cases: integerSchema,
      failed_cases: integerSchema,
      requested_points: integerSchema,
      terminal_points: integerSchema,
      measured_points: integerSchema,
      covered_skus: arraySchema(stringSchema),
    }),
    coverage: arraySchema(anyObjectSchema),
    series: arraySchema(anyObjectSchema),
  },
  ['version', 'run', 'coverage', 'series'],
);
const collectiveRunSummarySchema = objectSchema({
  run_id: stringSchema,
  run_attempt: integerSchema,
  generated_at: { type: 'string', format: 'date-time' },
  conclusion: nullableStringSchema,
  covered_skus: arraySchema(stringSchema),
  requested_cases: integerSchema,
  measured_cases: integerSchema,
  requested_points: integerSchema,
  terminal_points: integerSchema,
  terminal_counts: objectSchema({
    measured: integerSchema,
    unsupported: integerSchema,
    failed: integerSchema,
  }),
});
const percentileSchema = objectSchema({
  mean: numberSchema,
  p50: numberSchema,
  p75: numberSchema,
  p90: numberSchema,
  p99: numberSchema,
});
const nullablePercentileSchema: ApiSchema = { oneOf: [percentileSchema, { type: 'null' }] };
const idListSchema: ApiSchema = { type: 'string', pattern: '^\\d+(,\\d+)*$' };
const positiveIdSchema: ApiSchema = { type: 'integer', minimum: 1 };

export const apiDocumentationGroups: readonly ApiDocumentationGroup[] = [
  {
    id: 'core',
    title: text('Core benchmark data', '核心基准数据'),
    description: text(
      'Benchmark results, availability, workflow provenance, evaluations, and reliability.',
      '基准结果、可用配置、工作流来源、评测与可靠性数据。',
    ),
  },
  {
    id: 'external',
    title: text('External feeds', '外部数据源'),
    description: text(
      'Stable feeds for spreadsheets, release tracking, submissions, and runtime images.',
      '面向电子表格、版本跟踪、提交记录和运行镜像的稳定数据源。',
    ),
  },
  {
    id: 'datasets',
    title: text('Datasets', '数据集'),
    description: text(
      'Dataset registry, metadata, conversation indexes, and conversation structures.',
      '数据集目录、元数据、会话索引与会话结构。',
    ),
  },
  {
    id: 'collectivex',
    title: text('CollectiveX', 'CollectiveX'),
    description: text(
      'Versioned collective communication sweep results and run discovery.',
      '带版本的集合通信扫描结果与运行发现数据。',
    ),
  },
  {
    id: 'diagnostics',
    title: text('Diagnostic reads', '诊断读取'),
    description: text(
      'Per-result trace, cache, request, sibling, and server metric diagnostics.',
      '按结果提供跟踪、缓存、请求、同组结果和服务器指标诊断。',
    ),
  },
];

export const apiOperations: readonly ApiOperation[] = [
  {
    id: 'get-availability',
    group: 'core',
    method: 'GET',
    path: '/api/v1/availability',
    summary: text('List available benchmark configurations', '列出可用的基准配置'),
    description: text(
      'Returns model, sequence, precision, hardware, framework, speculative method, benchmark type, and date combinations that have benchmark data.',
      '返回已有基准数据的模型、序列、精度、硬件、框架、推测方法、基准类型和日期组合。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success('Available configuration rows.', '可用配置行。', availabilitySchema, [
        {
          model: 'dsr1',
          isl: 1024,
          osl: 1024,
          precision: 'fp8',
          hardware: 'h200_sxm',
          framework: 'vllm',
          spec_method: 'none',
          disagg: false,
          benchmark_type: 'single_turn',
          date: '2026-08-08',
        },
      ]),
      errorResponse(
        '500',
        'The availability query failed.',
        '可用配置查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'AvailabilityRows',
    curlUrl: `${API_BASE_URL}/api/v1/availability`,
  },
  {
    id: 'list-benchmarks',
    group: 'core',
    method: 'GET',
    path: '/api/v1/benchmarks',
    summary: text('Read benchmark results', '读取基准结果'),
    description: text(
      'Returns raw benchmark rows for a display model. Use date for an as-of snapshot, exact=true for that exact date, runId to constrain the latest lookup, or exactRun=true with a numeric runId to return only that workflow run. The page-owned calculator view is not part of this public contract.',
      '按展示模型返回原始基准行。可用 date 获取截至该日的快照，exact=true 限定该日，runId 约束最新查询，或将 exactRun=true 与数字 runId 组合以仅返回该工作流运行。页面专用的计算器视图不属于此公开契约。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'model',
        'query',
        true,
        'string',
        'Display model name.',
        '展示模型名称。',
        { type: 'string', enum: SUPPORTED_BENCHMARK_MODELS },
        'DeepSeek-R1-0528',
      ),
      parameter(
        'date',
        'query',
        false,
        'date',
        'Latest data on or before YYYY-MM-DD, unless exact is true.',
        'YYYY-MM-DD 当日或之前的最新数据，exact 为 true 时仅限当日。',
        { type: 'string', format: 'date' },
        '2026-08-08',
      ),
      parameter(
        'benchmarkType',
        'query',
        false,
        'string',
        'Set to agentic_traces to scope per-run configuration coverage to Agentic Traces.',
        '设为 agentic_traces 可将每次运行的配置覆盖限定为 Agentic Traces。',
        { type: 'string', enum: ['agentic_traces'] },
        'agentic_traces',
      ),
      parameter(
        'exact',
        'query',
        false,
        'boolean',
        'Set true to require the supplied date exactly.',
        '设为 true 时严格匹配所给日期。',
        { type: 'boolean', default: false },
        false,
      ),
      parameter(
        'runId',
        'query',
        false,
        'integer',
        'Numeric GitHub Actions run ID. Non-numeric values are ignored.',
        'GitHub Actions 数字运行 ID。非数字值会被忽略。',
        positiveIdSchema,
        123456789,
      ),
      parameter(
        'exactRun',
        'query',
        false,
        'boolean',
        'With a numeric runId, return only that run instead of an as-of result.',
        '与数字 runId 一起使用时，仅返回该次运行而非截至日期的结果。',
        { type: 'boolean', default: false },
        false,
      ),
    ],
    responses: [
      success(
        'Benchmark rows with scalar metrics in the metrics object.',
        '基准行，标量指标位于 metrics 对象中。',
        benchmarkRowsSchema,
        benchmarkExample,
      ),
      errorResponse(
        '400',
        'The model is missing or unsupported.',
        '模型缺失或不受支持。',
        'Unknown model',
      ),
      errorResponse(
        '500',
        'The benchmark query failed.',
        '基准查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'BenchmarkRows',
    curlUrl: `${API_BASE_URL}/api/v1/benchmarks?model=DeepSeek-R1-0528`,
  },
  {
    id: 'list-benchmark-history',
    group: 'core',
    method: 'GET',
    path: '/api/v1/benchmarks/history',
    summary: text('Read benchmark history', '读取基准历史'),
    description: text(
      'Returns every dated benchmark row for one model and either a fixed input/output token pair or Agentic Traces.',
      '返回某个模型以及固定输入/输出 token 组合或 Agentic Traces 的全部历史基准行。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'model',
        'query',
        true,
        'string',
        'Display model name.',
        '展示模型名称。',
        { type: 'string', enum: SUPPORTED_BENCHMARK_MODELS },
        'DeepSeek-R1-0528',
      ),
      parameter(
        'isl',
        'query',
        false,
        'integer',
        'Positive input sequence length in tokens. Required unless benchmarkType=agentic_traces.',
        '正整数输入序列长度，单位为 token；除非 benchmarkType=agentic_traces，否则必填。',
        positiveIdSchema,
        1024,
      ),
      parameter(
        'osl',
        'query',
        false,
        'integer',
        'Positive output sequence length in tokens. Required unless benchmarkType=agentic_traces.',
        '正整数输出序列长度，单位为 token；除非 benchmarkType=agentic_traces，否则必填。',
        positiveIdSchema,
        1024,
      ),
      parameter(
        'benchmarkType',
        'query',
        false,
        'string',
        'Set to agentic_traces to read Agentic Traces history without ISL/OSL.',
        '设为 agentic_traces 可在不提供 ISL/OSL 的情况下读取 Agentic Traces 历史。',
        { type: 'string', enum: ['agentic_traces'] },
        'agentic_traces',
      ),
    ],
    responses: [
      success('Historical benchmark rows.', '历史基准行。', benchmarkRowsSchema, benchmarkExample),
      errorResponse(
        '400',
        'Required parameters are missing or the model is unsupported.',
        '必填参数缺失或模型不受支持。',
        'Missing required parameters',
      ),
      errorResponse('500', 'The history query failed.', '历史查询失败。', 'Internal server error'),
    ],
    responseShapeName: 'BenchmarkRows',
    curlUrl: `${API_BASE_URL}/api/v1/benchmarks/history?model=DeepSeek-R1-0528&isl=1024&osl=1024`,
  },
  {
    id: 'get-workflow-info',
    group: 'core',
    method: 'GET',
    path: '/api/v1/workflow-info',
    summary: text('Read workflow provenance', '读取工作流来源'),
    description: text(
      'Returns workflow runs, changelogs, available configurations, and per-run configuration coverage. Omit date for all dates.',
      '返回工作流运行、变更记录、可用配置以及每次运行的配置覆盖。省略 date 可读取全部日期。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'date',
        'query',
        false,
        'date',
        'Optional YYYY-MM-DD filter.',
        '可选的 YYYY-MM-DD 筛选条件。',
        { type: 'string', format: 'date' },
        '2026-08-08',
      ),
    ],
    responses: [
      success(
        'Workflow provenance grouped into four arrays.',
        '按四个数组组织的工作流来源数据。',
        workflowInfoSchema,
        {
          runs: [
            {
              github_run_id: 123456789,
              name: 'nightly-h200',
              conclusion: 'success',
              run_attempt: 1,
              html_url:
                'https://github.com/semianalysis/inference-benchmarks/actions/runs/123456789',
              created_at: '2026-08-08T03:00:00Z',
              date: '2026-08-08',
            },
          ],
          changelogs: [],
          configs: [],
          runConfigs: [],
        },
      ),
      errorResponse(
        '400',
        'date is not YYYY-MM-DD.',
        'date 不是 YYYY-MM-DD。',
        'Invalid date format',
      ),
      errorResponse(
        '500',
        'The workflow query failed.',
        '工作流查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'WorkflowInfo',
    curlUrl: `${API_BASE_URL}/api/v1/workflow-info?date=2026-08-08`,
  },
  {
    id: 'list-evaluations',
    group: 'core',
    method: 'GET',
    path: '/api/v1/evaluations',
    summary: text('List evaluation aggregates', '列出评测汇总'),
    description: text(
      'Returns latest-attempt evaluation results with configuration, task, provenance, and metric values.',
      '返回最新尝试的评测结果，包含配置、任务、来源和指标值。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success('Evaluation result rows.', '评测结果行。', evaluationsSchema, [
        {
          id: 72,
          config_id: 11,
          hardware: 'h200_sxm',
          framework: 'vllm',
          model: 'dsr1',
          precision: 'fp8',
          spec_method: 'none',
          disagg: false,
          is_multinode: false,
          prefill_tp: 8,
          prefill_ep: 1,
          prefill_dp_attention: false,
          prefill_num_workers: 1,
          decode_tp: 8,
          decode_ep: 1,
          decode_dp_attention: false,
          decode_num_workers: 1,
          num_prefill_gpu: 0,
          num_decode_gpu: 8,
          task: 'gpqa',
          date: '2026-08-08',
          conc: null,
          metrics: { accuracy: 0.78 },
          timestamp: '2026-08-08T03:00:00Z',
          run_url: null,
        },
      ]),
      errorResponse(
        '500',
        'The evaluation query failed.',
        '评测查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'EvaluationRows',
    curlUrl: `${API_BASE_URL}/api/v1/evaluations`,
  },
  {
    id: 'list-reliability',
    group: 'core',
    method: 'GET',
    path: '/api/v1/reliability',
    summary: text('List benchmark reliability', '列出基准可靠性'),
    description: text(
      'Returns successful and total run counts by hardware and date.',
      '按硬件和日期返回成功运行数与总运行数。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success('Reliability count rows.', '可靠性计数行。', reliabilitySchema, [
        { hardware: 'h200_sxm', date: '2026-08-08', n_success: 18, total: 20 },
      ]),
      errorResponse(
        '500',
        'The reliability query failed.',
        '可靠性查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'ReliabilityRows',
    curlUrl: `${API_BASE_URL}/api/v1/reliability`,
  },
  {
    id: 'get-tco-feed',
    group: 'external',
    method: 'GET',
    path: '/api/v1/tco-feed',
    summary: text('Compute a TCO feed', '计算 TCO 数据源'),
    description: text(
      'Computes Pareto-frontier throughput points or weighted scores for spreadsheet TCO models. Every scoring assumption is encoded in the URL. CSV returns the same selected view as a flat table.',
      '为电子表格 TCO 模型计算帕累托前沿吞吐点或加权分数。所有评分假设都编码在 URL 中。CSV 会将同一所选视图返回为平面表格。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'model',
        'query',
        false,
        'string',
        'DB model key or display model name.',
        '数据库模型键或展示模型名称。',
        { type: 'string', enum: SUPPORTED_TCO_MODELS, default: 'dsv4' },
        'dsv4',
      ),
      parameter(
        'workloads',
        'query',
        false,
        'CSV workload list',
        'Comma-separated <isl>x<osl> token pairs.',
        '以逗号分隔的 <isl>x<osl> token 组合。',
        { type: 'string', default: '1024x1024,8192x1024', pattern: '^\\d+x\\d+(,\\d+x\\d+)*$' },
        '1024x1024,8192x1024',
      ),
      parameter(
        'tiers',
        'query',
        false,
        'CSV number list',
        'Positive interactivity targets in output tokens per second per user.',
        '正数交互性目标，单位为每用户每秒输出 token。',
        { type: 'string', default: '30,50,75,100' },
        '30,50,75,100',
      ),
      parameter(
        'date',
        'query',
        false,
        'date',
        'Use data on or before YYYY-MM-DD. Omit for latest.',
        '使用 YYYY-MM-DD 当日或之前的数据。省略则使用最新数据。',
        { type: 'string', format: 'date' },
        '2026-08-08',
      ),
      parameter(
        'format',
        'query',
        false,
        'enum',
        'Response encoding.',
        '响应编码。',
        { type: 'string', enum: ['json', 'csv'], default: 'json' },
        'json',
      ),
      parameter(
        'view',
        'query',
        false,
        'enum',
        'points returns one row per hardware, workload, and tier. scores returns one row per hardware.',
        'points 为每个硬件、负载和档位返回一行。scores 为每个硬件返回一行。',
        { type: 'string', enum: ['points', 'scores'], default: 'points' },
        'points',
      ),
      parameter(
        'weights',
        'query',
        false,
        'CSV number list',
        'scores only. One non-negative weight per tier, normalized to sum to 1.',
        '仅用于 scores。每个档位一个非负权重，并归一化为总和 1。',
        { type: 'string', default: '0.35,0.4,0.2,0.05' },
        '0.35,0.4,0.2,0.05',
      ),
      parameter(
        'workload_weights',
        'query',
        false,
        'CSV number list',
        'scores only. One non-negative weight per workload, normalized to sum to 1. Defaults to equal weights.',
        '仅用于 scores。每个负载一个非负权重，并归一化为总和 1。默认等权。',
        { type: 'string' },
        '0.5,0.5',
      ),
      parameter(
        'alpha',
        'query',
        false,
        'number',
        'scores only. Input-token value ratio in [0, 10].',
        '仅用于 scores。输入 token 价值比，范围为 [0, 10]。',
        { type: 'number', minimum: 0, maximum: 10, default: 0.25 },
        0.25,
      ),
    ],
    responses: [
      success(
        'The selected points or scores envelope.',
        '所选 points 或 scores 数据包。',
        tcoFeedSchema,
        {
          model: 'dsv4',
          db_model_keys: ['dsv4'],
          date: null,
          workloads: ['1024x1024'],
          tiers: [50],
          rows: [
            {
              hardware: 'h200_sxm',
              workload: '1024x1024',
              tier: 50,
              tput_per_gpu: 118.2,
              is_interpolated: true,
            },
          ],
        },
        [
          {
            mediaType: 'text/csv',
            schema: stringSchema,
            example: 'model,hardware,workload,tier,tput_per_gpu\ndsv4,h200_sxm,1024x1024,50,118.2',
          },
        ],
      ),
      errorResponse(
        '400',
        'A model, date, view, format, workload, tier, weight, or alpha value is invalid.',
        '模型、日期、视图、格式、负载、档位、权重或 alpha 值无效。',
        'Invalid tiers: expected comma-separated positive numbers',
      ),
      errorResponse(
        '500',
        'The TCO calculation failed.',
        'TCO 计算失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'TcoFeed',
    curlUrl: `${API_BASE_URL}/api/v1/tco-feed?model=dsv4&workloads=1024x1024,8192x1024&tiers=30,50,75,100&view=points&format=json`,
  },
  {
    id: 'get-submissions',
    group: 'external',
    method: 'GET',
    path: '/api/v1/submissions',
    summary: text('Read submission coverage', '读取提交覆盖'),
    description: text(
      'Returns configuration-level submission summaries and daily hardware submission volume.',
      '返回配置级提交汇总和每日硬件提交量。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success('Submission summary and volume arrays.', '提交汇总和数量数组。', submissionsSchema, {
        summary: [
          {
            model: 'dsr1',
            hardware: 'h200_sxm',
            framework: 'vllm',
            precision: 'fp8',
            spec_method: 'none',
            disagg: false,
            is_multinode: false,
            num_prefill_gpu: 0,
            num_decode_gpu: 8,
            date: '2026-08-08',
            total_datapoints: 24,
            distinct_sequences: 3,
            distinct_concurrencies: 8,
            max_concurrency: 256,
            image: 'vllm/vllm-openai:v0.10.2',
          },
        ],
        volume: [{ date: '2026-08-08', hardware: 'h200_sxm', datapoints: 24 }],
      }),
      errorResponse(
        '500',
        'The submissions query failed.',
        '提交查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'Submissions',
    curlUrl: `${API_BASE_URL}/api/v1/submissions`,
  },
  {
    id: 'get-framework-releases',
    group: 'external',
    method: 'GET',
    path: '/api/v1/framework-releases',
    summary: text('Read latest framework releases', '读取最新框架版本'),
    description: text(
      'Returns the latest non-draft, non-prerelease GitHub release tag for vLLM and SGLang. A null value means the upstream lookup had no usable release.',
      '返回 vLLM 和 SGLang 最新的非草稿、非预发布 GitHub 版本标签。null 表示上游查询没有可用版本。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success(
        'Framework keys mapped to release tags or null.',
        '框架键映射到版本标签或 null。',
        mapSchema(nullableStringSchema),
        { vllm: 'v0.10.2', sglang: 'v0.4.10' },
      ),
      errorResponse('500', 'The release lookup failed.', '版本查询失败。', 'Internal server error'),
    ],
    responseShapeName: 'FrameworkReleases',
    curlUrl: `${API_BASE_URL}/api/v1/framework-releases`,
  },
  {
    id: 'get-latest-images',
    group: 'external',
    method: 'GET',
    path: '/api/v1/latest-images',
    summary: text('Read latest runtime images', '读取最新运行镜像'),
    description: text(
      'Returns the latest container image observed for each benchmark configuration and sequence.',
      '返回每个基准配置和序列最近观测到的容器镜像。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success('Latest image rows.', '最新镜像行。', latestImagesSchema, [
        {
          model: 'dsr1',
          hardware: 'h200_sxm',
          framework: 'vllm',
          precision: 'fp8',
          spec_method: 'none',
          disagg: false,
          isl: 1024,
          osl: 1024,
          image: 'vllm/vllm-openai:v0.10.2',
          date: '2026-08-08',
        },
      ]),
      errorResponse('500', 'The image query failed.', '镜像查询失败。', 'Internal server error'),
    ],
    responseShapeName: 'LatestImageRows',
    curlUrl: `${API_BASE_URL}/api/v1/latest-images`,
  },
  {
    id: 'list-datasets',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets',
    summary: text('List ingested datasets', '列出已导入的数据集'),
    description: text(
      'Returns dataset registry cards without the large chart_data field.',
      '返回数据集目录卡片，不包含较大的 chart_data 字段。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [],
    responses: [
      success('Dataset registry records.', '数据集目录记录。', arraySchema(datasetRecordSchema), [
        {
          id: 'ds_01',
          slug: 'cc-traces-weka',
          label: 'CC Traces Weka',
          variant: 'default',
          description: 'Agentic coding traces',
          hf_url: 'https://huggingface.co/datasets/example/cc-traces-weka',
          license: 'Apache-2.0',
          conversation_count: 1200,
          summary: { totalIn: 8200000, totalOut: 1700000 },
          ingested_at: '2026-08-08T03:00:00Z',
        },
      ]),
      errorResponse(
        '500',
        'The dataset registry query failed.',
        '数据集目录查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'DatasetRecords',
    curlUrl: `${API_BASE_URL}/api/v1/datasets`,
  },
  {
    id: 'get-dataset',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{slug}',
    summary: text('Read dataset details', '读取数据集详情'),
    description: text(
      'Returns one dataset registry record plus its precomputed chart_data distributions.',
      '返回一条数据集目录记录及其预计算的 chart_data 分布。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'slug',
        'path',
        true,
        'string',
        'Dataset slug from the registry.',
        '目录中的数据集 slug。',
        { type: 'string', minLength: 1 },
        'cc-traces-weka',
      ),
    ],
    responses: [
      success(
        'Dataset metadata with chart_data.',
        '包含 chart_data 的数据集元数据。',
        objectSchema({ ...datasetRecordSchema.properties, chart_data: anyObjectSchema }),
        {
          id: 'ds_01',
          slug: 'cc-traces-weka',
          label: 'CC Traces Weka',
          variant: 'default',
          description: 'Agentic coding traces',
          hf_url: null,
          license: 'Apache-2.0',
          conversation_count: 1200,
          summary: {},
          ingested_at: '2026-08-08T03:00:00Z',
          chart_data: { tokens: { bins: [0, 1000, 2000], counts: [140, 320] } },
        },
      ),
      errorResponse('404', 'No dataset has this slug.', '没有使用此 slug 的数据集。', 'Not found'),
      errorResponse(
        '500',
        'The dataset query failed.',
        '数据集查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'DatasetDetail',
    curlUrl: `${API_BASE_URL}/api/v1/datasets/cc-traces-weka`,
  },
  {
    id: 'list-dataset-conversations',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{slug}/conversations',
    summary: text('List dataset conversations', '列出数据集会话'),
    description: text(
      'Returns a searchable, sorted, paginated conversation index. It contains counts only, not the full conversation structure.',
      '返回可搜索、排序和分页的会话索引。只包含计数，不包含完整会话结构。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'slug',
        'path',
        true,
        'string',
        'Dataset slug from the registry.',
        '目录中的数据集 slug。',
        { type: 'string', minLength: 1 },
        'cc-traces-weka',
      ),
      parameter(
        'search',
        'query',
        false,
        'string',
        'Trimmed conversation ID search, at most 100 characters.',
        '按会话 ID 搜索，会先去除首尾空格，最多 100 个字符。',
        { type: 'string', maxLength: 100 },
        'trace-018',
      ),
      parameter(
        'limit',
        'query',
        false,
        'integer',
        'Page size, clamped to 1 through 200.',
        '每页数量，限制在 1 到 200。',
        { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        50,
      ),
      parameter(
        'offset',
        'query',
        false,
        'integer',
        'Zero-based row offset. Negative values become 0.',
        '从 0 开始的行偏移。负数会变为 0。',
        { type: 'integer', minimum: 0, default: 0 },
        0,
      ),
      parameter(
        'sort',
        'query',
        false,
        'enum',
        'Sort by tokens, turns, subagents, or id. Unknown values fall back to tokens.',
        '按 tokens、turns、subagents 或 id 排序。未知值回退到 tokens。',
        { type: 'string', enum: ['tokens', 'turns', 'subagents', 'id'], default: 'tokens' },
        'tokens',
      ),
    ],
    responses: [
      success(
        'Total count and conversation index items.',
        '总数和会话索引项。',
        objectSchema({ total: integerSchema, items: arraySchema(conversationItemSchema) }),
        {
          total: 1200,
          items: [
            {
              conv_id: 'trace-018',
              models: ['claude-sonnet-4'],
              num_turns: 42,
              num_subagent_groups: 3,
              total_in: 18200,
              total_out: 4200,
              total_cached: 9600,
            },
          ],
        },
      ),
      errorResponse(
        '400',
        'search exceeds 100 characters.',
        'search 超过 100 个字符。',
        'search too long',
      ),
      errorResponse('404', 'No dataset has this slug.', '没有使用此 slug 的数据集。', 'Not found'),
      errorResponse(
        '500',
        'The conversation query failed.',
        '会话查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'ConversationList',
    curlUrl: `${API_BASE_URL}/api/v1/datasets/cc-traces-weka/conversations?limit=50&offset=0&sort=tokens`,
  },
  {
    id: 'get-dataset-conversation',
    group: 'datasets',
    method: 'GET',
    path: '/api/v1/datasets/{slug}/conversations/{convId}',
    summary: text('Read a conversation structure', '读取会话结构'),
    description: text(
      'Returns one conversation and its flamegraph-ready nested structure. App Router decodes each path value once.',
      '返回单个会话及可用于火焰图的嵌套结构。App Router 对每个路径值解码一次。',
    ),
    audience: 'public',
    stability: 'stable',
    parameters: [
      parameter(
        'slug',
        'path',
        true,
        'string',
        'Dataset slug from the registry.',
        '目录中的数据集 slug。',
        { type: 'string', minLength: 1 },
        'cc-traces-weka',
      ),
      parameter(
        'convId',
        'path',
        true,
        'string',
        'Conversation ID exactly as listed by the conversation index.',
        '会话索引中列出的原始会话 ID。',
        { type: 'string', minLength: 1 },
        'trace-018',
      ),
    ],
    responses: [
      success(
        'Conversation counts and nested structure.',
        '会话计数和嵌套结构。',
        objectSchema({ ...conversationItemSchema.properties, structure: anyObjectSchema }),
        {
          conv_id: 'trace-018',
          models: ['claude-sonnet-4'],
          num_turns: 42,
          num_subagent_groups: 3,
          total_in: 18200,
          total_out: 4200,
          total_cached: 9600,
          structure: { name: 'trace-018', children: [] },
        },
      ),
      errorResponse(
        '404',
        'The dataset or conversation does not exist.',
        '数据集或会话不存在。',
        'Not found',
      ),
      errorResponse(
        '500',
        'The conversation query failed.',
        '会话查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'ConversationDetail',
    curlUrl: `${API_BASE_URL}/api/v1/datasets/cc-traces-weka/conversations/trace-018`,
  },
  {
    id: 'get-collectivex-latest',
    group: 'collectivex',
    method: 'GET',
    path: '/api/v1/collectivex/latest',
    summary: text('Read the latest CollectiveX dataset', '读取最新 CollectiveX 数据集'),
    description: text(
      'Discovers and ingests the latest sweep when needed, then returns its versioned neutral dataset. A stored run is served if refresh fails.',
      '按需发现并导入最新扫描，然后返回带版本的中立数据集。若刷新失败，会返回已存储的运行。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'version',
        'query',
        true,
        'enum',
        'CollectiveX contract version.',
        'CollectiveX 契约版本。',
        { type: 'integer', enum: [...COLLECTIVEX_VERSIONS] },
        COLLECTIVEX_VERSIONS.at(-1) ?? 1,
      ),
    ],
    responses: [
      success(
        'Latest CollectiveX run, coverage, series, and optional KV cases.',
        '最新 CollectiveX 运行、覆盖、序列和可选 KV 案例。',
        collectiveXDatasetSchema,
        {
          version: 1,
          run: {
            run_id: '123456789',
            run_attempt: 1,
            generated_at: '2026-08-08T03:00:00Z',
            conclusion: 'success',
            source_sha: '0123456789abcdef',
            requested_cases: 12,
            terminal_cases: 12,
            measured_cases: 10,
            unsupported_cases: 2,
            failed_cases: 0,
            requested_points: 48,
            terminal_points: 48,
            measured_points: 40,
            covered_skus: ['h200_sxm'],
          },
          coverage: [],
          series: [],
        },
      ),
      errorResponse(
        '400',
        'version is missing or unsupported.',
        'version 缺失或不受支持。',
        'Unknown version',
      ),
      errorResponse(
        '404',
        'No stored or discoverable run exists.',
        '没有已存储或可发现的运行。',
        'Not found',
      ),
      errorResponse(
        '502',
        'Upstream sweep discovery is unavailable and no stored fallback exists.',
        '上游扫描发现不可用，且没有已存储的回退数据。',
        'Unavailable',
      ),
      errorResponse(
        '503',
        'Upstream sweep processing is temporarily unavailable.',
        '上游扫描处理暂时不可用。',
        'Unavailable',
      ),
      errorResponse(
        '500',
        'The stored run query failed.',
        '已存储运行查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'CollectiveXDataset',
    curlUrl: `${API_BASE_URL}/api/v1/collectivex/latest?version=1`,
  },
  {
    id: 'list-collectivex-runs',
    group: 'collectivex',
    method: 'GET',
    path: '/api/v1/collectivex/runs',
    summary: text('List CollectiveX runs', '列出 CollectiveX 运行'),
    description: text(
      'Returns progressively discovered run summaries. discovery_complete=false means clients may poll while older runs are still being discovered.',
      '返回逐步发现的运行汇总。discovery_complete=false 表示仍在发现更早的运行，客户端可以轮询。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'version',
        'query',
        true,
        'enum',
        'CollectiveX contract version.',
        'CollectiveX 契约版本。',
        { type: 'integer', enum: [...COLLECTIVEX_VERSIONS] },
        COLLECTIVEX_VERSIONS.at(-1) ?? 1,
      ),
    ],
    responses: [
      success(
        'Version, run summaries, and discovery state.',
        '版本、运行汇总和发现状态。',
        objectSchema({
          version: integerSchema,
          runs: arraySchema(collectiveRunSummarySchema),
          discovery_complete: booleanSchema,
        }),
        {
          version: 1,
          runs: [
            {
              run_id: '123456789',
              run_attempt: 1,
              generated_at: '2026-08-08T03:00:00Z',
              conclusion: 'success',
              covered_skus: ['h200_sxm'],
              requested_cases: 12,
              measured_cases: 10,
              requested_points: 48,
              terminal_points: 48,
              terminal_counts: { measured: 40, unsupported: 8, failed: 0 },
            },
          ],
          discovery_complete: true,
        },
      ),
      errorResponse(
        '400',
        'version is missing or unsupported.',
        'version 缺失或不受支持。',
        'Unknown version',
      ),
      errorResponse(
        '502',
        'Discovery failed and no stored run list exists.',
        '发现失败，且没有已存储的运行列表。',
        'Unavailable',
      ),
      errorResponse(
        '503',
        'Discovery is temporarily unavailable.',
        '发现暂时不可用。',
        'Unavailable',
      ),
      errorResponse(
        '500',
        'The stored run list query failed.',
        '已存储运行列表查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'CollectiveXRunList',
    curlUrl: `${API_BASE_URL}/api/v1/collectivex/runs?version=1`,
  },
  {
    id: 'get-collectivex-run',
    group: 'collectivex',
    method: 'GET',
    path: '/api/v1/collectivex/runs/{runId}',
    summary: text('Read a CollectiveX run', '读取 CollectiveX 运行'),
    description: text(
      'Returns one positive numeric run ID as a versioned CollectiveX dataset, discovering and ingesting it on demand when possible.',
      '按正整数运行 ID 返回带版本的 CollectiveX 数据集，并在可能时按需发现和导入。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'runId',
        'path',
        true,
        'integer',
        'Positive GitHub Actions run ID.',
        'GitHub Actions 正整数运行 ID。',
        positiveIdSchema,
        123456789,
      ),
      parameter(
        'version',
        'query',
        true,
        'enum',
        'CollectiveX contract version.',
        'CollectiveX 契约版本。',
        { type: 'integer', enum: [...COLLECTIVEX_VERSIONS] },
        COLLECTIVEX_VERSIONS.at(-1) ?? 1,
      ),
    ],
    responses: [
      success(
        'The requested CollectiveX dataset.',
        '请求的 CollectiveX 数据集。',
        collectiveXDatasetSchema,
        {
          version: 1,
          run: {
            run_id: '123456789',
            run_attempt: 1,
            generated_at: '2026-08-08T03:00:00Z',
            conclusion: 'success',
            source_sha: '0123456789abcdef',
            requested_cases: 12,
            terminal_cases: 12,
            measured_cases: 10,
            unsupported_cases: 2,
            failed_cases: 0,
            requested_points: 48,
            terminal_points: 48,
            measured_points: 40,
            covered_skus: ['h200_sxm'],
          },
          coverage: [],
          series: [],
        },
      ),
      errorResponse(
        '400',
        'version or runId is invalid.',
        'version 或 runId 无效。',
        'Unknown version or run id',
      ),
      errorResponse('404', 'The run does not exist.', '该运行不存在。', 'Not found'),
      errorResponse(
        '502',
        'The run cannot be fetched from the upstream source.',
        '无法从上游来源获取该运行。',
        'Unavailable',
      ),
      errorResponse(
        '503',
        'Upstream processing is temporarily unavailable.',
        '上游处理暂时不可用。',
        'Unavailable',
      ),
      errorResponse('500', 'The run query failed.', '运行查询失败。', 'Internal server error'),
    ],
    responseShapeName: 'CollectiveXDataset',
    curlUrl: `${API_BASE_URL}/api/v1/collectivex/runs/123456789?version=1`,
  },
  {
    id: 'get-agentic-aggregates',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/agentic-aggregates',
    summary: text('Read agentic aggregate percentiles', '读取智能体汇总百分位'),
    description: text(
      'Returns ISL, OSL, KV-cache utilization, and prefix-cache hit-rate percentiles keyed by benchmark result ID. IDs are deduplicated and at most 200 are accepted.',
      '按基准结果 ID 返回 ISL、OSL、KV 缓存利用率和前缀缓存命中率百分位。ID 会去重，最多接受 200 个。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'ids',
        'query',
        true,
        'comma-separated integers',
        'One to 200 positive benchmark result IDs.',
        '1 到 200 个正整数基准结果 ID。',
        idListSchema,
        '421,422',
      ),
    ],
    responses: [
      success(
        'Result IDs mapped to aggregate percentiles or null metric groups.',
        '结果 ID 映射到汇总百分位或 null 指标组。',
        mapSchema(
          objectSchema({
            id: integerSchema,
            isl: nullablePercentileSchema,
            osl: nullablePercentileSchema,
            kvCacheUtil: nullablePercentileSchema,
            prefixCacheHitRate: nullablePercentileSchema,
          }),
        ),
        {
          '421': {
            id: 421,
            isl: { mean: 18320, p50: 16440, p75: 20110, p90: 24880, p99: 31900 },
            osl: null,
            kvCacheUtil: null,
            prefixCacheHitRate: null,
          },
        },
      ),
      errorResponse(
        '400',
        'ids is missing, malformed, or exceeds 200 unique IDs.',
        'ids 缺失、格式错误或超过 200 个唯一 ID。',
        'Expected ids as comma-separated positive integers',
      ),
      errorResponse(
        '500',
        'The aggregate query failed.',
        '汇总查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'AgenticAggregateMap',
    curlUrl: `${API_BASE_URL}/api/v1/agentic-aggregates?ids=421,422`,
  },
  {
    id: 'get-benchmark-siblings',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/benchmark-siblings',
    summary: text('Read sibling benchmark points', '读取同组基准点'),
    description: text(
      'Returns the benchmark SKU and every point in the same hardware, framework, model, precision, method, benchmark type, and workflow run.',
      '返回基准 SKU，以及同一硬件、框架、模型、精度、方法、基准类型和工作流运行中的全部点。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'id',
        'query',
        true,
        'integer',
        'Positive benchmark result ID.',
        '正整数基准结果 ID。',
        positiveIdSchema,
        421,
      ),
    ],
    responses: [
      success(
        'SKU metadata and sibling navigation rows.',
        'SKU 元数据和同组导航行。',
        objectSchema({ sku: anyObjectSchema, siblings: arraySchema(anyObjectSchema) }),
        {
          sku: {
            hardware: 'h200_sxm',
            framework: 'vllm',
            model: 'dsr1',
            precision: 'fp8',
            spec_method: 'none',
            benchmark_type: 'agentic_traces',
            github_run_id: 123456789,
            date: '2026-08-08',
            dataset_slug: 'cc-traces-weka',
          },
          siblings: [
            {
              id: 421,
              conc: 32,
              offload_mode: 'off',
              decode_tp: 8,
              decode_ep: 1,
              decode_pp: null,
              decode_dp_attention: false,
              decode_num_workers: 1,
              prefill_tp: 8,
              prefill_ep: 1,
              prefill_pp: null,
              prefill_dp_attention: false,
              prefill_num_workers: 1,
              num_prefill_gpu: 0,
              num_decode_gpu: 8,
              disagg: false,
              is_multinode: false,
              tput_per_gpu: 128.4,
              total_requests: 320,
              is_current: true,
              has_trace: true,
            },
          ],
        },
      ),
      errorResponse(
        '400',
        'id is missing or invalid.',
        'id 缺失或无效。',
        'Expected a positive numeric id',
      ),
      errorResponse(
        '404',
        'No benchmark result has this ID.',
        '没有使用此 ID 的基准结果。',
        'Not found',
      ),
      errorResponse('500', 'The sibling query failed.', '同组查询失败。', 'Internal server error'),
    ],
    responseShapeName: 'BenchmarkSiblings',
    curlUrl: `${API_BASE_URL}/api/v1/benchmark-siblings?id=421`,
  },
  {
    id: 'get-derived-agentic-metrics',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/derived-agentic-metrics',
    summary: text('Read derived agentic metrics', '读取派生智能体指标'),
    description: text(
      'Returns normalized interactivity percentiles keyed by benchmark result ID. IDs are deduplicated and at most 200 are accepted.',
      '按基准结果 ID 返回归一化交互性百分位。ID 会去重，最多接受 200 个。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'ids',
        'query',
        true,
        'comma-separated integers',
        'One to 200 positive benchmark result IDs.',
        '1 到 200 个正整数基准结果 ID。',
        idListSchema,
        '421,422',
      ),
    ],
    responses: [
      success(
        'Result IDs mapped to p75 and p90 normalized interactivity.',
        '结果 ID 映射到 p75 和 p90 归一化交互性。',
        mapSchema(
          objectSchema({
            id: integerSchema,
            p75_e2e_norm_intvty: nullableNumberSchema,
            p90_e2e_norm_intvty: nullableNumberSchema,
          }),
        ),
        { '421': { id: 421, p75_e2e_norm_intvty: 31.2, p90_e2e_norm_intvty: 24.8 } },
      ),
      errorResponse(
        '400',
        'ids is missing, malformed, or exceeds 200 unique IDs.',
        'ids 缺失、格式错误或超过 200 个唯一 ID。',
        'Expected ids as comma-separated positive integers',
      ),
      errorResponse(
        '500',
        'The derived metric query failed.',
        '派生指标查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'DerivedAgenticMetricMap',
    curlUrl: `${API_BASE_URL}/api/v1/derived-agentic-metrics?ids=421,422`,
  },
  {
    id: 'get-request-timeline',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/request-timeline',
    summary: text('Read a request timeline', '读取请求时间线'),
    description: text(
      'Returns a versioned benchmark window and per-request dispatch, acknowledgement, completion, token, phase, worker, and cancellation timing.',
      '返回带版本的基准窗口，以及每个请求的调度、确认、完成、token、阶段、工作进程和取消时间。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'id',
        'query',
        true,
        'integer',
        'Positive benchmark result ID.',
        '正整数基准结果 ID。',
        positiveIdSchema,
        421,
      ),
    ],
    responses: [
      success(
        'Timeline metadata and request records. Nanosecond event fields are offsets from startNs.',
        '时间线元数据和请求记录。纳秒事件字段是相对 startNs 的偏移。',
        objectSchema({
          version: integerSchema,
          startNs: integerSchema,
          endNs: integerSchema,
          durationS: numberSchema,
          requests: arraySchema(
            objectSchema({
              cid: stringSchema,
              ti: integerSchema,
              wid: stringSchema,
              ad: integerSchema,
              phase: stringSchema,
              credit: integerSchema,
              start: integerSchema,
              ack: nullableNumberSchema,
              end: integerSchema,
              ttftMs: nullableNumberSchema,
              tpotMs: nullableNumberSchema,
              isl: nullableNumberSchema,
              osl: nullableNumberSchema,
              cancelled: booleanSchema,
            }),
          ),
        }),
        {
          version: 5,
          startNs: 1000000000,
          endNs: 2400000000,
          durationS: 1.4,
          requests: [
            {
              cid: 'trace-018',
              ti: 0,
              wid: '7',
              ad: 0,
              phase: 'profiling',
              credit: 0,
              start: 1200000,
              ack: 1800000,
              end: 420000000,
              ttftMs: 42.3,
              tpotMs: 18.1,
              isl: 18320,
              osl: 410,
              cancelled: false,
            },
          ],
        },
      ),
      errorResponse(
        '400',
        'id is missing or invalid.',
        'id 缺失或无效。',
        'Expected a positive numeric id',
      ),
      errorResponse(
        '404',
        'No timeline exists for this result.',
        '该结果没有时间线。',
        'Not found',
      ),
      errorResponse(
        '500',
        'The timeline query failed.',
        '时间线查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'RequestTimeline',
    curlUrl: `${API_BASE_URL}/api/v1/request-timeline?id=421`,
  },
  {
    id: 'get-server-log',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/server-log',
    summary: text('Read a benchmark server log', '读取基准服务器日志'),
    description: text(
      'Returns the stored plain-text server log for one benchmark result ID.',
      '返回某个基准结果 ID 已存储的纯文本服务器日志。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'id',
        'query',
        true,
        'integer',
        'Positive benchmark result ID.',
        '正整数基准结果 ID。',
        positiveIdSchema,
        421,
      ),
    ],
    responses: [
      success(
        'Benchmark result ID and server log text.',
        '基准结果 ID 和服务器日志文本。',
        objectSchema({ id: integerSchema, serverLog: stringSchema }),
        { id: 421, serverLog: 'INFO engine initialized\nINFO benchmark complete' },
      ),
      errorResponse('400', 'id is missing or invalid.', 'id 缺失或无效。', 'Invalid id'),
      errorResponse(
        '404',
        'No server log exists for this result.',
        '该结果没有服务器日志。',
        'Not found',
      ),
      errorResponse(
        '500',
        'The server log query failed.',
        '服务器日志查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'ServerLog',
    curlUrl: `${API_BASE_URL}/api/v1/server-log?id=421`,
  },
  {
    id: 'get-trace-availability',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/trace-availability',
    summary: text('Check trace availability', '检查跟踪可用性'),
    description: text(
      'Returns only benchmark result IDs that have a stored trace. IDs are deduplicated and at most 500 are accepted.',
      '仅返回具有已存储跟踪的基准结果 ID。ID 会去重，最多接受 500 个。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'ids',
        'query',
        true,
        'comma-separated integers',
        'One to 500 positive benchmark result IDs.',
        '1 到 500 个正整数基准结果 ID。',
        idListSchema,
        '421,422',
      ),
    ],
    responses: [
      success(
        'Available result IDs mapped to true. Missing keys have no trace.',
        '可用结果 ID 映射为 true。缺失的键表示没有跟踪。',
        mapSchema(booleanSchema),
        { '421': true },
      ),
      errorResponse(
        '400',
        'ids is missing, malformed, or exceeds 500 unique IDs.',
        'ids 缺失、格式错误或超过 500 个唯一 ID。',
        'Expected ids as comma-separated positive integers',
      ),
      errorResponse(
        '500',
        'The trace availability query failed.',
        '跟踪可用性查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'TraceAvailabilityMap',
    curlUrl: `${API_BASE_URL}/api/v1/trace-availability?ids=421,422`,
  },
  {
    id: 'get-trace-histograms',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/trace-histograms',
    summary: text('Read trace histograms', '读取跟踪直方图'),
    description: text(
      'Returns input and output token count arrays for each benchmark result ID. IDs are deduplicated and at most 200 are accepted.',
      '按基准结果 ID 返回输入和输出 token 计数数组。ID 会去重，最多接受 200 个。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'ids',
        'query',
        true,
        'comma-separated integers',
        'One to 200 positive benchmark result IDs.',
        '1 到 200 个正整数基准结果 ID。',
        idListSchema,
        '421,422',
      ),
    ],
    responses: [
      success(
        'Result IDs mapped to raw ISL and OSL samples.',
        '结果 ID 映射到原始 ISL 和 OSL 样本。',
        mapSchema(
          objectSchema({
            id: integerSchema,
            isl: arraySchema(numberSchema),
            osl: arraySchema(numberSchema),
          }),
        ),
        { '421': { id: 421, isl: [18220, 19340, 15110], osl: [410, 380, 512] } },
      ),
      errorResponse(
        '400',
        'ids is missing, malformed, or exceeds 200 unique IDs.',
        'ids 缺失、格式错误或超过 200 个唯一 ID。',
        'Expected ids as comma-separated positive integers',
      ),
      errorResponse(
        '500',
        'The histogram query failed.',
        '直方图查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'TraceHistogramMap',
    curlUrl: `${API_BASE_URL}/api/v1/trace-histograms?ids=421,422`,
  },
  {
    id: 'get-trace-server-metrics',
    group: 'diagnostics',
    method: 'GET',
    path: '/api/v1/trace-server-metrics',
    summary: text('Read trace server metrics', '读取跟踪服务器指标'),
    description: text(
      'Returns point metadata and chart-ready time series for cache usage, queue depth, prefill and decode throughput, prompt-token sources, and metric sources.',
      '返回点元数据，以及缓存使用率、队列深度、预填充和解码吞吐、提示 token 来源与指标来源的图表时间序列。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      parameter(
        'id',
        'query',
        true,
        'integer',
        'Positive benchmark result ID.',
        '正整数基准结果 ID。',
        positiveIdSchema,
        421,
      ),
    ],
    responses: [
      success(
        'Point metadata, window bounds, and server metric series.',
        '点元数据、窗口边界和服务器指标序列。',
        objectSchema({
          meta: anyObjectSchema,
          startNs: integerSchema,
          endNs: integerSchema,
          durationS: numberSchema,
          timeslicesCount: integerSchema,
          kvCacheUsage: arraySchema(anyObjectSchema),
          prefixCacheHitRate: arraySchema(anyObjectSchema),
          queueDepth: arraySchema(anyObjectSchema),
          promptTokensBySource: mapSchema(arraySchema(anyObjectSchema)),
          prefillTps: arraySchema(anyObjectSchema),
          decodeTps: arraySchema(anyObjectSchema),
          prefixCacheHitsTps: arraySchema(anyObjectSchema),
          hostKvCacheUsage: arraySchema(anyObjectSchema),
          kvCacheUsageByEngine: arraySchema(anyObjectSchema),
          kvCachePoolTokens: nullableNumberSchema,
          metricSources: arraySchema(anyObjectSchema),
        }),
        {
          meta: {
            id: 421,
            hardware: 'h200_sxm',
            framework: 'vllm',
            model: 'dsr1',
            conc: 32,
            date: '2026-08-08',
          },
          startNs: 1000000000,
          endNs: 2400000000,
          durationS: 1.4,
          timeslicesCount: 2,
          kvCacheUsage: [{ t: 0, v: 0.44 }],
          prefixCacheHitRate: [],
          queueDepth: [],
          promptTokensBySource: {},
          prefillTps: [],
          decodeTps: [],
          prefixCacheHitsTps: [],
          hostKvCacheUsage: [],
          kvCacheUsageByEngine: [],
          kvCachePoolTokens: 983040,
          metricSources: [],
        },
      ),
      errorResponse(
        '400',
        'id is missing or invalid.',
        'id 缺失或无效。',
        'Expected a positive numeric id',
      ),
      errorResponse(
        '404',
        'No server metrics exist for this result.',
        '该结果没有服务器指标。',
        'Not found',
      ),
      errorResponse(
        '500',
        'The server metric query failed.',
        '服务器指标查询失败。',
        'Internal server error',
      ),
    ],
    responseShapeName: 'TraceServerMetrics',
    curlUrl: `${API_BASE_URL}/api/v1/trace-server-metrics?id=421`,
  },
];

const overview = {
  title: text('InferenceX API reference', 'InferenceX API 参考文档'),
  eyebrow: text('Public data API', '公开数据 API'),
  description: text(
    'Read benchmark, provenance, dataset, CollectiveX, and diagnostic data from the same sources that power InferenceX.',
    '读取为 InferenceX 提供数据的基准、来源、数据集、CollectiveX 和诊断信息。',
  ),
  auth: {
    title: text('Authentication', '身份验证'),
    description: text(
      'Published read endpoints do not require authentication.',
      '已发布的只读端点不需要身份验证。',
    ),
  },
  format: {
    title: text('Response format', '响应格式'),
    description: text(
      'Responses are JSON unless an endpoint explicitly documents CSV. Dates use YYYY-MM-DD and timestamps use UTC ISO 8601.',
      '除非端点明确说明 CSV，否则响应均为 JSON。日期使用 YYYY-MM-DD，时间戳使用 UTC ISO 8601。',
    ),
  },
  conventions: [
    {
      id: 'errors',
      title: text('Errors', '错误'),
      description: text(
        'JSON errors contain an error string. A 400 response means a parameter is missing or invalid, 404 means the requested record is absent, and 500 means the server query failed.',
        'JSON 错误包含 error 字符串。400 表示参数缺失或无效，404 表示请求的记录不存在，500 表示服务器查询失败。',
      ),
    },
    {
      id: 'cache',
      title: text('Caching', '缓存'),
      description: text(
        'Read endpoints may be served from shared caches. CollectiveX uses short refresh windows, and framework releases use a one-hour shared cache.',
        '只读端点可能由共享缓存提供。CollectiveX 使用较短的刷新窗口，框架版本使用一小时共享缓存。',
      ),
    },
    {
      id: 'identifiers',
      title: text('Identifiers', '标识符'),
      description: text(
        'Benchmark result IDs and GitHub run IDs are positive integers. Bulk diagnostic endpoints accept comma-separated, deduplicated IDs.',
        '基准结果 ID 和 GitHub 运行 ID 为正整数。批量诊断端点接受以逗号分隔并去重的 ID。',
      ),
    },
  ],
  schemaNotes: [
    {
      id: 'benchmark-row',
      title: text('BenchmarkRow', 'BenchmarkRow'),
      description: text(
        'Configuration fields sit beside a metrics map. Metric keys evolve independently; values are numbers, time metrics are seconds, and throughput metrics use tokens per second per GPU unless their name states otherwise.',
        '配置字段与 metrics 映射并列。指标键可独立演进；值为数字，时间指标单位为秒，吞吐指标默认为每 GPU 每秒 token，除非名称另有说明。',
      ),
      shape: 'BenchmarkRows',
      example: benchmarkExample[0],
    },
    {
      id: 'metric-maps',
      title: text('ID-keyed maps', '以 ID 为键的映射'),
      description: text(
        'Bulk diagnostic responses are JSON objects whose keys are decimal benchmark result IDs. A missing key means no value was available for that ID.',
        '批量诊断响应是以十进制基准结果 ID 为键的 JSON 对象。缺少某个键表示该 ID 没有可用值。',
      ),
      shape: 'Record<string, value>',
      example: { '421': true },
    },
    {
      id: 'collectivex-version',
      title: text('CollectiveX versions', 'CollectiveX 版本'),
      description: text(
        `CollectiveX reads require an explicit supported contract version. Supported versions: ${COLLECTIVEX_VERSIONS.join(', ')}.`,
        `CollectiveX 读取需要明确指定受支持的契约版本。受支持版本：${COLLECTIVEX_VERSIONS.join('、')}。`,
      ),
      shape: 'CollectiveXDataset',
    },
  ],
};

const quickstartOperationIds = ['get-availability', 'list-benchmarks'] as const;
const quickstartText = {
  'get-availability': {
    title: text('Discover configurations', '发现可用配置'),
    description: text(
      'Start with availability to choose real model, hardware, framework, and sequence values.',
      '先读取可用配置，以选择真实的模型、硬件、框架和序列值。',
    ),
  },
  'list-benchmarks': {
    title: text('Fetch benchmark rows', '获取基准行'),
    description: text(
      'Then request the latest raw benchmark rows for a supported display model.',
      '然后为受支持的展示模型请求最新原始基准行。',
    ),
  },
} as const;

function localizeOperation(
  operation: ApiOperation,
  locale: ApiDocumentationLocale,
): LocalizedApiOperation {
  return {
    ...operation,
    summary: operation.summary[locale],
    description: operation.description[locale],
    parameters: operation.parameters.map((item) => ({
      ...item,
      description: item.description[locale],
    })),
    responses: operation.responses.map((item) => ({
      ...item,
      description: item.description[locale],
    })),
  };
}

function createLocalizedDocumentation(locale: ApiDocumentationLocale) {
  const operationById = new Map(apiOperations.map((operation) => [operation.id, operation]));
  return {
    locale,
    title: overview.title[locale],
    eyebrow: overview.eyebrow[locale],
    description: overview.description[locale],
    baseUrl: API_BASE_URL,
    version: API_VERSION,
    specVersion: OPENAPI_DISPLAY_VERSION,
    openApiUrl: OPENAPI_DOCUMENT_URL,
    auth: {
      title: overview.auth.title[locale],
      description: overview.auth.description[locale],
    },
    format: {
      title: overview.format.title[locale],
      description: overview.format.description[locale],
    },
    quickstarts: quickstartOperationIds.map((id) => {
      const operation = operationById.get(id)!;
      return {
        id,
        label: quickstartText[id].title[locale],
        description: quickstartText[id].description[locale],
        command: `curl "${operation.curlUrl}"`,
      };
    }),
    conventions: overview.conventions.map((item) => ({
      id: item.id,
      title: item.title[locale],
      description: item.description[locale],
    })),
    schemaNotes: overview.schemaNotes.map((item) => ({
      id: item.id,
      title: item.title[locale],
      description: item.description[locale],
      shape: item.shape,
      ...('example' in item ? { example: item.example } : {}),
    })),
    groups: apiDocumentationGroups.map((group) => ({
      id: group.id,
      title: group.title[locale],
      description: group.description[locale],
      operations: apiOperations
        .filter((operation) => operation.group === group.id)
        .map((operation) => localizeOperation(operation, locale)),
    })),
  };
}

const localizedDocumentation = {
  en: createLocalizedDocumentation('en'),
  zh: createLocalizedDocumentation('zh'),
} as const;

export function getApiDocumentation(locale: ApiDocumentationLocale) {
  return localizedDocumentation[locale];
}

export function buildOpenApiDocument(serverUrl: string = API_BASE_URL): OpenApiDocument {
  const normalizedServerUrl = serverUrl.replace(/\/$/u, '');
  const schemas: Record<string, ApiSchema> = { ErrorResponse: errorSchema };
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of apiOperations) {
    const successResponse = operation.responses.find((response) =>
      response.status.startsWith('2'),
    )!;
    schemas[operation.responseShapeName] ??= successResponse.schema;

    const responses = Object.fromEntries(
      operation.responses.map((response) => {
        const mediaType = response.mediaType ?? 'application/json';
        const primarySchema = response.status.startsWith('2')
          ? { $ref: `#/components/schemas/${operation.responseShapeName}` }
          : { $ref: '#/components/schemas/ErrorResponse' };
        const content: Record<string, unknown> = {
          [mediaType]: { schema: primarySchema, example: response.example },
        };
        for (const alternate of response.alternateRepresentations ?? []) {
          content[alternate.mediaType] = { schema: alternate.schema, example: alternate.example };
        }
        return [
          response.status,
          {
            description: response.description.en,
            'x-description-zh': response.description.zh,
            content,
          },
        ];
      }),
    );

    paths[operation.path] = {
      ...paths[operation.path],
      [operation.method.toLowerCase()]: {
        operationId: operation.id,
        tags: [operation.group],
        summary: operation.summary.en,
        description: operation.description.en,
        'x-summary-zh': operation.summary.zh,
        'x-description-zh': operation.description.zh,
        'x-audience': operation.audience,
        'x-stability': operation.stability,
        security: [],
        'x-response-shape': operation.responseShapeName,
        parameters: operation.parameters.map((item) => ({
          name: item.name,
          in: item.location,
          required: item.required,
          description: item.description.en,
          'x-description-zh': item.description.zh,
          schema: item.schema,
          example: item.example,
        })),
        responses,
      },
    };
  }
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'InferenceX Data API',
      version: API_DOCUMENT_VERSION,
      description: overview.description.en,
      'x-description-zh': overview.description.zh,
    },
    servers: [{ url: normalizedServerUrl, description: 'InferenceX production API' }],
    externalDocs: {
      description: 'InferenceX API reference',
      url: `${normalizedServerUrl}/api`,
    },
    tags: apiDocumentationGroups.map((group) => ({
      name: group.id,
      description: group.description.en,
      'x-name-zh': group.title.zh,
      'x-description-zh': group.description.zh,
    })),
    paths,
    components: { schemas },
  };
}
