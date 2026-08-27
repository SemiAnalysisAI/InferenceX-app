import { GPU_CHART_METRICS } from '@/lib/gpu-specs';
import type {
  ApiOperation,
  ApiParameter,
  ApiResponse,
  ApiSchema,
  BilingualText,
} from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';

/**
 * Docs fragment for GET /api/v1/views/gpu-specs.
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
const nullableNumberSchema: ApiSchema = { type: ['number', 'null'] };
const nullableStringSchema: ApiSchema = { type: ['string', 'null'] };
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

const METRIC_KEYS = GPU_CHART_METRICS.map((metric) => metric.key);

const parameters: readonly ApiParameter[] = [
  {
    name: 'metric',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Chart metric key. When set, the response adds a ranking array of chips ordered by that metric (descending; chips without a value omitted).',
      '图表指标键。设置后响应会附加 ranking 数组，按该指标降序排列芯片（无该指标值的芯片不参与排名）。',
    ),
    schema: { type: 'string', enum: METRIC_KEYS },
    example: 'memoryBandwidth',
  },
  {
    name: 'format',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'Response encoding. csv returns one flat row per chip.',
      '响应编码。csv 为每个芯片返回一行平面数据。',
    ),
    schema: { type: 'string', enum: ['json', 'csv'], default: 'json' },
    example: 'json',
  },
];

const chipSchema = objectSchema({
  key: stringSchema,
  label: stringSchema,
  name: stringSchema,
  vendor: { type: 'string', enum: ['nvidia', 'amd'] },
  memory: stringSchema,
  memoryType: stringSchema,
  memoryBandwidth: stringSchema,
  fp4: nullableNumberSchema,
  fp8: numberSchema,
  bf16: numberSchema,
  scaleUpTech: stringSchema,
  scaleUpBandwidth: stringSchema,
  scaleUpWorldSize: integerSchema,
  scaleOutBandwidth: nullableStringSchema,
  scaleOutTech: nullableStringSchema,
  nic: nullableStringSchema,
  scaleOutSwitch: nullableStringSchema,
  scaleOutTopology: nullableStringSchema,
  scaleUpTopology: stringSchema,
  scaleUpSwitch: nullableStringSchema,
  memoryGB: nullableNumberSchema,
  memoryBandwidthTBs: nullableNumberSchema,
  fp4Tflops: nullableNumberSchema,
  fp8Tflops: numberSchema,
  bf16Tflops: numberSchema,
  scaleUpBandwidthGBs: nullableNumberSchema,
  domainMemoryTB: numberSchema,
  domainMemoryBandwidthTBs: numberSchema,
  scaleOutBandwidthGbits: nullableNumberSchema,
});

const responseSchema = objectSchema(
  {
    view: { type: 'string', enum: ['gpu-specs'] },
    apiVersion: { type: 'string', enum: ['v1'] },
    params: objectSchema({
      metric: { type: ['string', 'null'] },
      format: { type: 'string', enum: ['json', 'csv'] },
    }),
    chips: arraySchema(chipSchema),
    metrics: arraySchema(
      objectSchema({ key: stringSchema, label: stringSchema, unit: stringSchema }),
    ),
    ranking: arraySchema(
      objectSchema({
        chip: stringSchema,
        label: stringSchema,
        value: numberSchema,
        rank: integerSchema,
      }),
    ),
  },
  ['view', 'apiVersion', 'params', 'chips', 'metrics'],
);

const responseExample = {
  view: 'gpu-specs',
  apiVersion: 'v1',
  params: { metric: 'memoryBandwidth', format: 'json' },
  chips: [
    {
      key: 'b200-sxm',
      label: 'B200 SXM',
      name: 'B200 SXM',
      vendor: 'nvidia',
      memory: '180 GB',
      memoryType: 'HBM3e',
      memoryBandwidth: '8 TB/s',
      fp4: 9000,
      fp8: 4500,
      bf16: 2250,
      scaleUpTech: 'NVLink 5.0',
      scaleUpBandwidth: '900 GB/s',
      scaleUpWorldSize: 8,
      scaleOutBandwidth: '400 Gbit/s',
      scaleOutTech: 'gIB RoCEv2 Ethernet',
      nic: 'ConnectX-7 400GbE',
      scaleOutSwitch: '12.8T Whitebox Leaf Tomahawk3 & 25.6T Whitebox Tomahawk4',
      scaleOutTopology: '4-rail optimized',
      scaleUpTopology: 'Switched 2-rail Optimized',
      scaleUpSwitch: '28.8Tbit/s NVSwitch Gen 4.0',
      memoryGB: 180,
      memoryBandwidthTBs: 8,
      fp4Tflops: 9000,
      fp8Tflops: 4500,
      bf16Tflops: 2250,
      scaleUpBandwidthGBs: 900,
      domainMemoryTB: 1.44,
      domainMemoryBandwidthTBs: 64,
      scaleOutBandwidthGbits: 400,
    },
  ],
  metrics: [
    { key: 'memory', label: 'Memory', unit: 'GB' },
    { key: 'memoryBandwidth', label: 'Mem BW', unit: 'TB/s' },
  ],
  ranking: [{ chip: 'b200-sxm', label: 'B200 SXM', value: 8, rank: 1 }],
};

const responses: readonly ApiResponse[] = [
  {
    status: '200',
    description: text(
      'Static chip specifications plus chart metric metadata; ranking is present only when metric is set.',
      '静态芯片规格与图表指标元数据；仅在设置 metric 时返回 ranking。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'key,label,name,vendor,memory,memoryType,memoryBandwidth,fp4,fp8,bf16\r\nb200-sxm,B200 SXM,B200 SXM,nvidia,180 GB,HBM3e,8 TB/s,9000,4500,2250',
      },
    ],
  },
  {
    status: '400',
    description: text(
      'The metric or format value is invalid. The body lists the allowed values.',
      'metric 或 format 参数无效。响应体会列出允许的取值。',
    ),
    schema: errorSchema,
    example: { error: 'Unknown metric: tdp', param: 'metric', allowed: METRIC_KEYS },
    mediaType: 'application/json',
  },
  {
    status: '500',
    description: text('Assembling the GPU specs payload failed.', 'GPU 规格数据组装失败。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
    mediaType: 'application/json',
  },
];

export const operations: ApiOperation[] = [
  {
    id: 'get-gpu-specs-view',
    group: VIEWS_GROUP,
    method: 'GET',
    path: '/api/v1/views/gpu-specs',
    summary: text('Get the GPU specs view', '获取 GPU 规格视图'),
    description: text(
      'Returns the static chip specification table behind the /gpu-specs page — usable memory, bandwidth, dense tensor-core TFLOP/s, and scale-up/scale-out interconnect details — plus the chartable metric metadata. No database read; compute TFLOPS are dense (no sparsity) and memory capacities are driver-usable values.',
      '返回 /gpu-specs 页面背后的静态芯片规格表——可用显存、带宽、稠密 Tensor Core TFLOP/s，以及 scale-up/scale-out 互连细节——并附带可作图指标的元数据。不读取数据库；算力为稠密（不含稀疏）值，显存容量为驱动可用值。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'GpuSpecsView',
    curlUrl: `${API_BASE_URL}/api/v1/views/gpu-specs?metric=memoryBandwidth&format=json`,
  },
];
