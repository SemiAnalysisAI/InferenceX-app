import type { ApiOperation, ApiSchema } from './api-documentation';
import { API_BASE_URL } from './api-documentation-base';
import {
  arraySchema,
  booleanSchema,
  errorSchema,
  integerSchema,
  objectSchema,
  stringSchema,
  text,
} from './api-documentation-helpers';

const jsonObject: ApiSchema = { type: 'object', additionalProperties: true };
const storedJson: ApiSchema = {};
const campaignSchema: ApiSchema = {
  ...objectSchema({
    slug: stringSchema,
    title: stringSchema,
    description: stringSchema,
    reference_points: arraySchema(jsonObject),
    comparison_notes: storedJson,
    manifest_sha256: stringSchema,
    expected_run_count: integerSchema,
    complete: booleanSchema,
  }),
  additionalProperties: true,
};
const runSchema: ApiSchema = {
  ...objectSchema({
    campaign_slug: stringSchema,
    run_id: stringSchema,
    series: stringSchema,
    concurrency: integerSchema,
    replicate: { type: ['integer', 'null'] },
    metrics: jsonObject,
    plot_metrics: jsonObject,
    configuration: jsonObject,
    provenance: jsonObject,
    health: jsonObject,
    cache_evidence: storedJson,
    clean_backend_qualified: booleanSchema,
    frontier_eligible: booleanSchema,
    record_sha256: stringSchema,
  }),
  additionalProperties: true,
};
const runExample = {
  campaign_slug: 'weka-amg-kimi-k3',
  run_id: 'sa-k3-original-rdma2048-c150-m089',
  series: 'recovered-c150',
  concurrency: 150,
  replicate: 1,
  metrics: {},
  plot_metrics: { uncached_tps_gpu: 197.07388928550017 },
  configuration: { gpu_memory_utilization: 0.89 },
  provenance: {},
  health: { status: 'recovered_OBJECT_NOT_FOUND_1_key_2944_tokens' },
  cache_evidence: {},
  clean_backend_qualified: false,
  frontier_eligible: false,
  record_sha256: '<stored record SHA-256>',
};
const parameters = [
  {
    name: 'campaign',
    location: 'path' as const,
    required: true,
    type: 'string',
    description: text('Stored experiment campaign slug.', '已存储的实验 campaign slug。'),
    schema: stringSchema,
    example: 'weka-amg-kimi-k3',
  },
];
const errors = [
  {
    status: '404' as const,
    description: text(
      'Campaign or run does not exist, or campaign ingest is incomplete.',
      '实验 campaign 或 run 不存在，或 campaign 数据尚未完整导入。',
    ),
    schema: errorSchema,
    example: { error: 'Not found' },
  },
  {
    status: '500' as const,
    description: text('The experiment database could not be read.', '无法读取实验数据库。'),
    schema: errorSchema,
    example: { error: 'Internal server error' },
  },
];

export const experimentOperations: readonly ApiOperation[] = [
  {
    id: 'get-experiment-campaign',
    group: 'core',
    method: 'GET',
    path: '/api/v1/experiments/{campaign}',
    summary: text('Experiment campaign and runs', '实验 campaign 与 run'),
    description: text(
      'Branch-scoped experiment data stored separately from official benchmarks. Returns raw campaign metadata, published reference points and every experiment replicate, including health flags and source provenance. No GitHub workflow or numeric benchmark identities are invented. No query filters or server-side chart calculations. The inference UI experiment selector reuses i_tokens=total|uncached; these are UI controls, not parameters on this raw endpoint. Cache-Control: no-store. Public read; no authentication.',
      '实验分支的数据独立于官方 benchmark 存储。返回原始 campaign 元数据、已发布的参考点、每次重复实验、健康状态和来源信息，不生成虚构的 GitHub workflow 或数值 benchmark ID。不支持查询筛选，不在服务端计算图表指标。推理界面的实验选择器复用 i_tokens=total|uncached；它们是界面控件，不是此原始数据接口的参数。Cache-Control: no-store。公开只读，无需认证。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses: [
      {
        status: '200',
        description: text('Raw campaign and run rows.', '原始 campaign 与 run 数据。'),
        schema: objectSchema({ campaign: campaignSchema, runs: arraySchema(runSchema) }),
        example: {
          campaign: {
            slug: 'weka-amg-kimi-k3',
            title: 'Kimi-K3: WEKA AMG and Mooncake DRAM',
            description: 'Completed experimental comparison; health qualifications remain visible.',
            reference_points: [],
            comparison_notes: [],
            manifest_sha256: '<stored campaign manifest SHA-256>',
            expected_run_count: 16,
            complete: true,
          },
          runs: [runExample],
        },
      },
      ...errors,
    ],
    responseShapeName: 'ExperimentCampaignResponse',
    curlUrl: `${API_BASE_URL}/api/v1/experiments/weka-amg-kimi-k3`,
  },
  {
    id: 'get-experiment-run',
    group: 'core',
    method: 'GET',
    path: '/api/v1/experiments/{campaign}/runs/{runId}',
    summary: text('Experiment run metrics and traces', '实验 run 的指标与 trace'),
    description: text(
      'Returns one stored experiment run with aggregate_stats, chart_series, request_timeline and payload_inventory. Trace projections preserve their stored shapes and missing measurements. Payload inventory identifies retained raw artifacts; this endpoint does not download raw compressed payload chunks. String run identity is scoped to the campaign; it is not a benchmark_result_id or GitHub Actions ID. Cache-Control: no-store. Public read; no authentication.',
      '返回单次实验 run 及其 aggregate_stats、chart_series、request_timeline 和 payload_inventory。trace 投影保留存储时的数据结构与缺失测量。payload 清单标识保留的原始文件，此接口不下载压缩的原始数据块。字符串 run ID 仅在 campaign 内有效，不是 benchmark_result_id 或 GitHub Actions ID。Cache-Control: no-store。公开只读，无需认证。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      ...parameters,
      {
        name: 'runId',
        location: 'path',
        required: true,
        type: 'string',
        description: text('Exact stored string run ID.', '存储的完整字符串 run ID。'),
        schema: stringSchema,
        example: runExample.run_id,
      },
    ],
    responses: [
      {
        status: '200',
        description: text('Raw stored run and trace projections.', '原始 run 与 trace 投影。'),
        schema: {
          ...runSchema,
          properties: {
            ...runSchema.properties,
            aggregate_stats: storedJson,
            chart_series: storedJson,
            request_timeline: storedJson,
            payload_inventory: storedJson,
          },
        },
        example: {
          ...runExample,
          aggregate_stats: null,
          chart_series: null,
          request_timeline: null,
          payload_inventory: [],
        },
      },
      ...errors,
    ],
    responseShapeName: 'ExperimentRunDetail',
    curlUrl: `${API_BASE_URL}/api/v1/experiments/weka-amg-kimi-k3/runs/${runExample.run_id}`,
  },
];
