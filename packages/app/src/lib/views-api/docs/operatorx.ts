import type { ApiOperation, ApiParameter, ApiResponse, ApiSchema } from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';
import {
  text,
  stringSchema,
  numberSchema,
  integerSchema,
  nullableStringSchema,
  nullableNumberSchema,
  errorSchema,
  objectSchema,
  arraySchema,
} from '@/lib/api-documentation-helpers';

/** Docs fragment for GET /api/v1/views/operatorx. */

const VIEWS_GROUP: ApiOperation['group'] = 'views';

const query = (
  name: string,
  en: string,
  zh: string,
  schema: ApiSchema,
  example: string,
): ApiParameter => ({
  name,
  location: 'query',
  required: false,
  type: schema.enum ? 'enum' : 'string',
  description: text(en, zh),
  schema,
  example,
});

const parameters: readonly ApiParameter[] = [
  query(
    'op',
    'Op family: gemm (default), moe, or attention (every attention module type).',
    '算子类别：gemm（默认）、moe 或 attention（包含所有注意力模块类型）。',
    { type: 'string', enum: ['gemm', 'moe', 'attention'], default: 'gemm' },
    'attention',
  ),
  query(
    'workload',
    'Workload source id from options.workloads, such as attention:Kimi-K3. Defaults to the best-covered workload. Mutually exclusive with model.',
    'options.workloads 中的工作负载 ID，例如 attention:Kimi-K3。默认选择覆盖最广的工作负载。不能与 model 同时使用。',
    stringSchema,
    'attention:DeepSeek-V4-Pro',
  ),
  query(
    'model',
    'Model name from options.models, case-insensitive: every case the model contributes, across workloads. Mutually exclusive with workload.',
    'options.models 中的模型名称，不区分大小写：返回该模型贡献的所有用例，跨工作负载。不能与 workload 同时使用。',
    stringSchema,
    'DeepSeek-V4-Pro',
  ),
  query(
    'parallel',
    'Device split key from options.parallel: 1 for one device (tp=dp=ep=dcp=1), else axes above 1 such as tp8 or dp8·ep8. Defaults to one device, else the smallest split present.',
    'options.parallel 中的设备切分键：1 表示单卡（tp=dp=ep=dcp=1），其余为大于 1 的维度，例如 tp8 或 dp8·ep8。默认单卡；没有单卡数据时选择最小的切分。',
    stringSchema,
    '1',
  ),
  query(
    'hardware',
    'Comma-separated GPU keys from options.hardware (h200, b200, mi355x, ...). Omit for all.',
    '以逗号分隔的 GPU 键，取自 options.hardware（h200、b200、mi355x 等）。省略时选择全部。',
    stringSchema,
    'b200,h200',
  ),
  query(
    'status',
    'Result status: ok (default), unsupported, error, missing, or all. A GPU that never ran a case has no row for it.',
    '结果状态：ok（默认）、unsupported、error、missing 或 all。未运行某用例的 GPU 不返回该用例的行。',
    {
      type: 'string',
      enum: ['ok', 'unsupported', 'error', 'missing', 'all'],
      default: 'ok',
    },
    'ok',
  ),
  query(
    'page',
    'Zero-based JSON page of 100 rows. CSV returns every matching row.',
    'JSON 页码，从 0 开始，每页 100 行。CSV 返回全部匹配行。',
    { type: 'integer', minimum: 0, default: 0 },
    '0',
  ),
  query(
    'format',
    'Response encoding. csv returns one flat row per case and GPU; sources and dims are joined into text.',
    '响应编码。csv 为每个用例与 GPU 返回一行平面数据；sources 与 dims 合并为文本。',
    { type: 'string', enum: ['json', 'csv'], default: 'json' },
    'json',
  ),
];

const rowSchema = objectSchema({
  case_key: stringSchema,
  op_type: {
    type: 'string',
    enum: ['gemm', 'moe', 'mla', 'mla_dsa', 'dsv4_attn', 'gqa', 'qsa', 'gdn', 'kda'],
  },
  parallel: stringSchema,
  testlist: stringSchema,
  sources: arraySchema(objectSchema({ model: stringSchema, roles: arraySchema(stringSchema) })),
  shape: stringSchema,
  precision: stringSchema,
  compute_precision: { type: 'string', enum: ['fp4', 'fp8', 'bf16', 'other'] },
  x: nullableNumberSchema,
  dims: { type: 'object', additionalProperties: numberSchema },
  flops: nullableNumberSchema,
  bytes: nullableNumberSchema,
  hardware: stringSchema,
  status: { type: 'string', enum: ['ok', 'unsupported', 'error', 'missing'] },
  latency_us: nullableNumberSchema,
  tflops: nullableNumberSchema,
  tb_s: nullableNumberSchema,
  roofline_us: nullableNumberSchema,
  roofline_share: nullableNumberSchema,
  kernel: nullableStringSchema,
  cuda_graph: { type: ['boolean', 'null'] },
  run_id: nullableStringSchema,
  result_index: { type: ['integer', 'null'] },
  revision: nullableStringSchema,
});

const responseSchema = objectSchema(
  {
    view: { type: 'string', enum: ['operatorx'] },
    apiVersion: { type: 'string', enum: ['v1'] },
    params: objectSchema({
      op: stringSchema,
      workload: nullableStringSchema,
      model: nullableStringSchema,
      parallel: stringSchema,
      hardware: arraySchema(stringSchema),
      status: stringSchema,
      page: integerSchema,
      format: { type: 'string', enum: ['json', 'csv'] },
    }),
    options: objectSchema({
      ops: arraySchema(stringSchema),
      workloads: arraySchema(
        objectSchema({
          id: stringSchema,
          label: stringSchema,
          cases: integerSchema,
          hardware: arraySchema(stringSchema),
        }),
      ),
      models: arraySchema(stringSchema),
      parallel: arraySchema(
        objectSchema({ key: stringSchema, label: stringSchema, cases: integerSchema }),
      ),
      hardware: arraySchema(
        objectSchema({
          id: stringSchema,
          runner: stringSchema,
          runs: arraySchema(objectSchema({ runId: stringSchema, generatedAt: stringSchema })),
        }),
      ),
    }),
    url: stringSchema,
    total: integerSchema,
    pageSize: integerSchema,
    rows: arraySchema(rowSchema),
  },
  ['view', 'apiVersion', 'params', 'options', 'url', 'total', 'pageSize', 'rows'],
);

const exampleRow = {
  case_key: '{"batch":{"groups":[{"count":1,"ctx":1024,"q":1}]},...}|vllm',
  op_type: 'dsv4_attn',
  parallel: '',
  testlist: 'attn_deepseek_v4',
  sources: [{ model: 'DeepSeek-V4-Pro', roles: ['attn'] }],
  shape: 'V4 attention ÷4 · 1×q1 ctx1024',
  precision: 'proj e4m3 (128×128 ue8m0) · kv fp8',
  compute_precision: 'fp8',
  x: 1,
  dims: { tokens: 1, hidden: 7168, heads: 128, compressRatio: 4 },
  flops: 1.2e9,
  bytes: 1.1e8,
  hardware: 'b200',
  status: 'ok',
  latency_us: 41.2,
  tflops: 29.1,
  tb_s: 2.67,
  roofline_us: 18.3,
  roofline_share: 0.44,
  kernel: 'flash_mla_sparse_fwd',
  cuda_graph: true,
  run_id: '36372535030',
  result_index: 66,
  revision: '63',
};

const responseExample = {
  view: 'operatorx',
  apiVersion: 'v1',
  params: {
    op: 'attention',
    workload: null,
    model: 'DeepSeek-V4-Pro',
    parallel: '1',
    hardware: ['b200', 'h200'],
    status: 'ok',
    page: 0,
    format: 'json',
  },
  options: {
    ops: ['gemm', 'moe', 'attention'],
    workloads: [
      {
        id: 'attention:DeepSeek-V4-Pro',
        label: 'DeepSeek-V4-Pro attention',
        cases: 99,
        hardware: ['b200', 'h200'],
      },
    ],
    models: ['DeepSeek-V4-Pro'],
    parallel: [{ key: '1', label: '1 GPU', cases: 99 }],
    hardware: [
      {
        id: 'b200',
        runner: 'b200-dgxc',
        runs: [{ runId: '36372535030', generatedAt: '2026-09-27T12:00:00Z' }],
      },
    ],
  },
  url: '/operatorx?op=model&model=DeepSeek-V4-Pro',
  total: 1,
  pageSize: 100,
  rows: [exampleRow],
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'The resolved selection, its options, and one row per case and GPU with that GPU’s newest stored result.',
      '解析后的选择、可选项，以及每个用例与 GPU 一行的数据（该 GPU 最新存储的结果）。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'case_key,op_type,parallel,testlist,sources,shape,precision,compute_precision,x,dims,flops,bytes,hardware,status,latency_us,tflops,tb_s\r\n...,dsv4_attn,,attn_deepseek_v4,DeepSeek-V4-Pro: attn,V4 attention ÷4 · 1×q1 ctx1024,proj e4m3 (128×128 ue8m0) · kv fp8,fp8,1,tokens=1 hidden=7168 heads=128 compressRatio=4,1200000000,110000000,b200,ok,41.2,29.1,2.67',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'A parameter is unknown, repeated, or out of range. The body lists the allowed values where they are known.',
      '参数未知、重复或超出范围。响应体会在可能时列出允许的取值。',
    ),
    schema: errorSchema,
    example: {
      error: 'Unknown parallel: tp4',
      param: 'parallel',
      allowed: ['1', 'tp8'],
    },
    mediaType: 'application/json',
  },
  {
    status: '503',
    description: text(
      'The OperatorX database could not be read. Not cached.',
      '无法读取 OperatorX 数据库。不缓存。',
    ),
    schema: errorSchema,
    example: { error: 'Source data unavailable' },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('Assembling the view failed.', '视图组装失败。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-operatorx-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/operatorx',
    summary: text('Get the OperatorX view', '获取 OperatorX 视图'),
    description: text(
      'OperatorX kernel-level measurements behind the /operatorx page: GEMM, MoE and attention ops timed on each GPU, aligned by case across hardware. One row per case and GPU, from that GPU’s newest stored run. Cases come from one workload source or from every case one model contributes, at one device split (parallel). flops and bytes are useful work per GPU (each data-parallel group’s work divided by tp), so tflops and tb_s compare across splits; they are null where the op has no defined count. roofline_us is the least time the case can take on that GPU: each stage (projection, attention core, experts, router, ...) bound by compute at the peak for its precision or by memory bandwidth, plus its collectives over the scale-up link; roofline_share is roofline_us over latency_us. run_id and result_index identify the stored result. Cached until new results are ingested; a response missing an unreadable run is not cached.',
      '/operatorx 页面背后的 OperatorX 算子级实测数据：在各 GPU 上计时的 GEMM、MoE 与注意力算子，按用例跨硬件对齐。每个用例与 GPU 一行，取该 GPU 最新存储的运行结果。用例来自一个工作负载，或某个模型贡献的全部用例，并限定在一种设备切分（parallel）下。flops 与 bytes 为每 GPU 的有效工作量（每个数据并行组的工作量除以 tp），因此 tflops 与 tb_s 可跨切分比较；算子未定义计数时为 null。roofline_us 为该用例在该 GPU 上的最短可能时间：每个阶段（投影、注意力核心、专家、路由等）按其自身精度的峰值算力或内存带宽取较慢者，再加上经 scale-up 链路的集合通信；roofline_share 为 roofline_us 与 latency_us 之比。run_id 与 result_index 标识存储的结果。在新结果入库前保持缓存；缺少无法读取的运行时不缓存。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'OperatorXView',
    curlUrl: `${API_BASE_URL}/api/v1/views/operatorx?op=attention&model=DeepSeek-V4-Pro`,
  },
];
