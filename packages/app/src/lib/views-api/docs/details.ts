import type { ApiOperation, ApiParameter, ApiSchema } from '@/lib/api-documentation';
import { API_BASE_URL } from '@/lib/api-documentation-base';
import { text } from '@/lib/api-documentation-helpers';
import { VIEW_QUERY_PARAMS } from '../registry';
import {
  catalogFields,
  datasetFields,
  pointFields,
  sampleFields,
  schemaExample,
} from './detail-schemas';

const object: ApiSchema = { type: 'object', additionalProperties: true };
const number: ApiSchema = { type: 'integer', minimum: 0 };
const notes: Record<string, [string, string, ApiSchema?, boolean?]> = {
  percentile: [
    'Request chart percentile, default p90; interactivity is the inverse TPOT percentile, not a percentile of request rates.',
    '请求图表的分位数，默认 p90；交互速度是 TPOT 分位数的倒数，不是逐请求速率的分位数。',
    { type: 'string', enum: ['p75', 'p90'], default: 'p90' },
  ],
  latencyMetric: [
    'Request latency chart: ttft (default) or e2e, in seconds. Uses the UI 50-request rolling and cumulative calculations.',
    '请求延迟图表：ttft（默认）或 e2e，单位为秒。复用界面的 50 请求滚动窗口与累计计算。',
    { type: 'string', enum: ['ttft', 'e2e'], default: 'ttft' },
  ],
  throughput: [
    'Comma-separated input and/or decode; default both. Empty selection is invalid. The total running average is returned only when both are selected, after a 60-second burn-in.',
    '以逗号分隔的 input、decode，默认两者均选。不可为空。仅同时选中两者时返回跳过前 60 秒的总吞吐量累计均值。',
  ],
  slug: [
    'Exact dataset slug from /api/v1/datasets.',
    '/api/v1/datasets 返回的数据集 slug，按原值传入。',
    { type: 'string', minLength: 1, maxLength: 512 },
    true,
  ],
  convId: [
    'One exact conversation ID; optional. Query decoding happens once.',
    '可选，指定一个完整对话 ID。查询参数只解码一次。',
  ],
  search: [
    'Case-insensitive substring. Dataset: conversation IDs across the index, at most 100 characters. Evaluation: prompt/response/target on the current page only, at most 512 characters; totals are not search totals.',
    '不区分大小写的子串。数据集搜索完整索引中的对话 ID，最长 100 个字符；评估仅搜索当前页的 prompt、response、target，最长 512 个字符，total 不代表搜索命中数。',
  ],
  sort: [
    'Conversation ordering, default tokens (total input descending); ties use ID.',
    '对话排序，默认 tokens（总输入 token 数降序）；相同值按 ID 排序。',
    { type: 'string', enum: ['tokens', 'turns', 'subagents', 'id'], default: 'tokens' },
  ],
  limit: [
    'Page size; default 50. Dataset maximum 200, evaluation maximum 500.',
    '每页条数，默认 50。数据集最多 200 条，评估最多 500 条。',
    { type: 'integer', minimum: 1, maximum: 500, default: 50 },
  ],
  offset: [
    'Zero-based page offset, default 0; decimal safe integer.',
    '从 0 开始的分页偏移量，默认 0，必须是十进制安全整数。',
    { ...number, default: 0 },
  ],
  expanded: [
    'all or up to 200 comma-separated subagent node indices; default collapsed. Requires convId. Deep-link targets expand their group.',
    'all 或最多 200 个子智能体节点索引，以逗号分隔；默认折叠。需指定 convId，深层链接目标所在分组会自动展开。',
  ],
  turn: [
    'Zero-based main/subagent turn ordinal; requires convId.',
    '主智能体或子智能体中从 0 开始的轮次序号，需指定 convId。',
    number,
  ],
  raw: [
    'Zero-based raw outer request index; takes precedence over turn. Requires convId.',
    '从 0 开始的原始外层请求索引，优先于 turn，需指定 convId。',
    number,
  ],
  inner: [
    'Zero-based child index within raw; requires convId.',
    'raw 对应节点内从 0 开始的子请求索引，需指定 convId。',
    number,
  ],
  sa: [
    'Exact subagent ID for turn addressing; requires convId.',
    '通过 turn 定位时使用的子智能体 ID，需指定 convId。',
  ],
  id: [
    'One selected positive safe benchmark result ID, plain decimal digits. Availability is checked before telemetry reads.',
    '选定的单个基准测试结果 ID，必须是十进制正安全整数。读取遥测前先检查数据是否存在。',
    { type: 'integer', minimum: 1 },
    true,
  ],
  phase: [
    'profiling (default), warmup, or all. Runs without warmup resolve to profiling. Request offsets are nanoseconds; server t values are seconds, each rebased to its own phase origin.',
    'profiling（默认）、warmup 或 all。无 warmup 的运行按 profiling 返回。请求偏移量单位为纳秒，服务端 t 单位为秒，各自按对应阶段的时间原点重算。',
    { type: 'string', enum: ['profiling', 'warmup', 'all'], default: 'profiling' },
  ],
  source: [
    'all (default) or an exact metricSources[].source.id from the all-source response.',
    'all（默认）或全来源响应中 metricSources[].source.id 的原值。',
  ],
  evalResultId: [
    'Positive stored evaluation result ID. Exactly one of evalResultId or runId is required.',
    '已存储评估结果的正整数 ID。evalResultId 和 runId 必须且只能提供一个。',
    { type: 'integer', minimum: 1 },
  ],
  runId: [
    'Positive public CI run ID for unofficial samples; requires all config identity fields. Live results are no-store.',
    '非官方样本对应的公开 CI 运行正整数 ID；需提供完整配置字段。实时结果不缓存。',
    { type: 'integer', minimum: 1 },
  ],
  task: ['Exact evaluation task for runId.', 'runId 对应的评估任务名，按原值传入。'],
  model: [
    'Exact raw model key for runId, not a display name.',
    'runId 对应的原始模型键，不是显示名称。',
  ],
  framework: ['Exact framework key for runId.', 'runId 对应的框架键，按原值传入。'],
  hardware: ['Exact hardware key for runId.', 'runId 对应的硬件键，按原值传入。'],
  precision: ['Exact precision key for runId.', 'runId 对应的精度键，按原值传入。'],
  specMethod: [
    'Exact speculative-decoding key for runId, including none.',
    'runId 对应的投机解码键，未使用时也需传入 none。',
  ],
  disagg: [
    'Disaggregated live config, default false.',
    '实时运行是否采用分离式配置，默认 false。',
    { type: 'boolean', default: false },
  ],
  concurrency: [
    'Optional positive live concurrency. Omission preserves the artifact resolver behavior.',
    '可选，实时运行的正整数并发数。省略时保留产物解析器的默认行为。',
    { type: 'integer', minimum: 1 },
  ],
  filter: [
    'all (default), passed or failed. docId overrides this to all.',
    'all（默认）、passed 或 failed；指定 docId 时改为 all。',
    { type: 'string', enum: ['all', 'passed', 'failed'], default: 'all' },
  ],
  docId: [
    'Stored sample ID, including 0. Resolves its containing page and overrides offset/filter. Unsupported for live runs.',
    '已存储样本的 ID，可为 0。定位其所在页并覆盖 offset、filter，不支持实时运行。',
    number,
  ],
};

const views = {
  dataset: {
    title: ['Dataset distributions and conversation flamegraph', '数据集分布与对话火焰图'],
    description: [
      'The dataset page projection retains precomputed chart_data and one paginated conversation index. convId adds one structure, shared visible rows and overlap brackets. Token bars use separate request/group scales, not wall-clock widths; nested group totals must not be added to their children. No prompt/code payload is reconstructed.',
      '返回数据集页面使用的预计算 chart_data 和一页对话索引。指定 convId 后增加该对话结构、共用计算函数生成的可见行及重叠标记。请求与分组使用各自的 token 刻度，条形宽度不表示时间；分组总量不可与其子项重复相加。不重建 prompt 或代码内容。',
    ],
    fields: datasetFields,
    query: '?slug=cc-traces-weka-062126-256k',
  },
  'agentx-catalog': {
    title: ['AgentX telemetry catalog', 'AgentX 遥测目录'],
    description: [
      'Uses the same model grouping, representative point selection and labels as /inference/agentic. Cards count stored trace-backed points, not every benchmark. Unknown registry identities are omitted as on the page.',
      '与 /inference/agentic 使用相同的模型分组、代表性数据点及标签。卡片统计已存储遥测的数据点，不代表全部基准测试；与页面一样，不显示注册表无法识别的条目。',
    ],
    fields: catalogFields,
    query: '',
  },
  'agentx-point': {
    title: ['AgentX phase and metric-source projection', 'AgentX 阶段与指标来源视图'],
    description: [
      'Reads one selected stored point, checks availability, then uses the frontend compact request decoder and phase helpers. Returns expanded request fields rather than dictionary tuples. Missing server metrics are null; missing stored request telemetry returns 404. Request microsecond quantization and JavaScript numeric timestamp precision match the UI; retain the raw timeline for exact timestamp analysis. No bulk point reads.',
      '读取选定的单个已存储数据点，先检查是否存在，再复用前端请求解码器和阶段计算函数。返回展开后的请求字段，不返回字典编码元组。缺失服务端指标返回 null，缺失请求遥测返回 404。请求的微秒量化及 JavaScript 数值时间戳精度与界面一致；精确时间戳分析应保留原始 timeline。不支持批量数据点读取。',
    ],
    fields: pointFields,
    query: '?id=421',
  },
  'evaluation-samples': {
    title: ['Evaluation sample drawer', '评估样本详情'],
    description: [
      'Stored and public unofficial sample pages share the existing drawer readers and current-page search helper. Includes prompt, target, response, rawResponse, demonstrations, score and nullable pass state already shown publicly. Pagination totals remain pre-search. No arbitrary repository, artifact URL, uploads, or writes; all responses are no-store.',
      '已存储样本与公开非官方运行样本复用详情面板的数据读取及当前页搜索函数。包含已公开展示的 prompt、target、response、rawResponse、示例、分数及可为空的通过状态。分页总数不受页内搜索影响。不接受任意仓库、产物 URL、上传或写入，所有响应均不缓存。',
    ],
    fields: sampleFields,
    query: '?evalResultId=1',
  },
} as const;

export const operations: ApiOperation[] = Object.entries(views).map(([key, definition]) => {
  const view = key as keyof typeof views;
  const parameters: ApiParameter[] = VIEW_QUERY_PARAMS[view].map((name) => {
    const [en, zh, schema = { type: 'string' }, required = false] = notes[name];
    return {
      name,
      location: 'query',
      required,
      type: String(schema.type),
      schema: view === 'dataset' && name === 'limit' ? { ...schema, maximum: 200 } : schema,
      description: text(en, zh),
      example:
        name === 'slug'
          ? 'cc-traces-weka-062126-256k'
          : (schema.default ??
            schema.enum?.[0] ??
            (schema.type === 'integer'
              ? (schema.minimum ?? 1)
              : schema.type === 'boolean'
                ? false
                : 'selected-id')),
    };
  });
  return {
    id: `get-${view}-view`,
    group: 'views',
    method: 'GET',
    path: `/api/v1/views/${view}`,
    summary: text(definition.title[0], definition.title[1]),
    description: text(definition.description[0], definition.description[1]),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses: [
      {
        status: '200',
        description: text('Resolved public page data.', '解析后的公开页面数据。'),
        schema: {
          type: 'object',
          properties: {
            view: { type: 'string', enum: [view] },
            apiVersion: { type: 'string', enum: ['v1'] },
            params: object,
            ...definition.fields,
          },
          required: ['view', 'apiVersion', 'params', ...Object.keys(definition.fields)],
          additionalProperties: true,
        },
        example: {
          view,
          apiVersion: 'v1',
          params: {},
          ...Object.fromEntries(
            Object.entries(definition.fields).map(([name, field]) => [name, schemaExample(field)]),
          ),
        },
        mediaType: 'application/json',
      },
      ...(['400', '404', '429', '500', '503'] as const).map((status) => ({
        status,
        description: text(
          'Invalid selection or source unavailable; failures are not cached.',
          '选择无效或数据源不可用，失败响应不缓存。',
        ),
        schema: object,
        example: { error: 'Source data unavailable' },
        mediaType: 'application/json' as const,
      })),
    ],
    responseShapeName: `${view
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('')}View`,
    curlUrl: `${API_BASE_URL}/api/v1/views/${view}${definition.query}`,
  };
});
