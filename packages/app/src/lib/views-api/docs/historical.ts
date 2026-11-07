import type { ApiOperation, ApiParameter, ApiResponse } from '@/lib/api/api-documentation';
import { API_BASE_URL } from '@/lib/api/api-documentation-base';
import {
  text,
  stringSchema,
  numberSchema,
  integerSchema,
  booleanSchema,
  objectSchema,
  arraySchema,
  listParam,
} from '@/lib/api/api-documentation-helpers';

const VIEWS_GROUP: ApiOperation['group'] = 'views';

const parameters: readonly ApiParameter[] = [
  {
    name: 'chart',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      "line returns the original trend series. waterfall also returns baseline, record-setting changes, and best-observed steps with source runs and strictly matched PR links. Synthetic extensions and recoveries are excluded. Output-only metrics exclude curves without recorded output throughput; excludedPointCount reports omitted dates. Lower-is-better metrics use descending changes. Links identify source curves, not isolated causal effects. frontier returns the data behind the dashboard's Frontier, Compare and Software gains views in `frontier`: each series' Pareto frontier (interactivity vs the metric) on every date it changed, using each configuration's full sweeps from the 7 days up to that date (or its latest earlier full sweep), where a sweep with fewer than 60% of the points of that configuration's median over its previous 5 sweeps is treated as a partial nightly and skipped; the owner of every interactivity level per date (the series with the best measured value at that interactivity or faster, no interpolation); and every change of owner with its multiplier, cause and how long it held. target and extendToDate do not apply to frontier.",
      'line 返回原始趋势线。waterfall 还返回基线、刷新最佳纪录的变化及最佳观测值，并附源运行记录及严格匹配的 PR 链接。不包含补齐点及性能恢复。输出 token 指标会排除缺少输出吞吐量实测记录的曲线，excludedPointCount 报告省略的日期数。越低越好的指标使用下降变化量。链接标识源曲线，不代表单个变更的独立效果。frontier 在 `frontier` 字段中返回仪表盘“前沿”“对比”“软件提升”视图背后的数据：每条序列（交互性与所选指标）的帕累托前沿在每次变化日期的取值，每个日期取各配置截至该日期 7 天内的完整扫描（若 7 天内没有，则取更早的最近一次完整扫描）；若某次扫描的数据点少于该配置前 5 次扫描中位数的 60%，视为未跑完的夜间扫描并跳过；每个日期各交互性水平的归属（在该交互性或更高交互性下实测值最优的序列，不做插值）；以及每次归属变化的倍数、原因和持续时长。target 与 extendToDate 不适用于 frontier。',
    ),
    schema: { type: 'string', enum: ['line', 'waterfall', 'frontier'], default: 'line' },
    example: 'waterfall',
  },
  {
    name: 'groupBy',
    location: 'query',
    required: false,
    type: 'enum',
    description: text(
      'chart=frontier only. gpu pools every configuration of a chip so ownership reads chip against chip; vendor pools every chip of a vendor (series keys are vendor names such as NVIDIA and AMD); config competes each hardware and engine series, matching the legend entries.',
      '仅用于 chart=frontier。gpu 将同一芯片的所有配置合并，按芯片比较归属；vendor 将同一厂商的所有芯片合并（序列键为 NVIDIA、AMD 等厂商名）；config 按硬件与推理引擎的每条序列比较，与图例条目一致。',
    ),
    schema: { type: 'string', enum: ['gpu', 'config', 'vendor'], default: 'gpu' },
    example: 'vendor',
  },
  listParam(
    'compare',
    text(
      'chart=frontier only. Comma-separated series keys to compare (from frontier.series[].key, e.g. NVIDIA,AMD with groupBy=vendor or gb300,mi355x with groupBy=gpu). Adds frontier.comparison: chapters for each compared series on its own (the same rule as frontier.chapters), and at 12 log-spaced interactivity buckets per date the leading series, the runner-up and the leader-over-runner-up ratio, reading each series frontier on the monotone curve the chart draws (Steffen slopes, as in the dashboard interpolation helpers). Below the slowest vertex of a series it keeps that vertex value; beyond its fastest vertex it does not reach the bucket. Keys match case-insensitively, keep their order, and unknown keys are ignored.',
      '仅用于 chart=frontier。逗号分隔的待比较序列键（取自 frontier.series[].key，例如 groupBy=vendor 时的 NVIDIA,AMD，或 groupBy=gpu 时的 gb300,mi355x）。会增加 frontier.comparison 字段：每个对比序列各自的章节（规则与 frontier.chapters 相同），以及每个日期在 12 个对数间隔的交互性分档上给出领先序列、第二名以及领先倍数，数值取自图中绘制的单调曲线（Steffen 斜率，与仪表盘插值函数一致）；低于某序列最慢顶点时沿用该顶点的值，超出最快顶点则视为未覆盖该分档。键不区分大小写并保持传入顺序，未知的键会被忽略。',
    ),
    'NVIDIA,AMD',
  ),
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
    schema: { type: 'string', default: 'y_tokensPerDollarH' },
    example: 'y_tpPerGpu',
  },
  {
    name: 'target',
    location: 'query',
    required: false,
    type: 'number',
    description: text(
      'Target interactivity (tok/s/user) at which the metric is interpolated for every snapshot. AgentX uses P90 slow-tail interactivity: 1 / P90 full-response ITL in seconds, with legacy ITL only when full-response mean/percentile ITL fields are absent. Missing or invalid P90 latency is omitted, never replaced with a median or raw rate percentile. Single-turn workloads retain median interactivity.',
      '每个快照日期上的指标按该目标交互性（tok/s/user）插值。AgentX 使用 P90 全响应 ITL（秒）的倒数；仅当全响应 ITL 的均值和分位数字段均缺失时才使用旧版 ITL。P90 延迟缺失或无效的数据点不参与计算，不会改用中位数，也不会直接使用 token 速率的 P90。单轮工作负载仍使用中位交互性。',
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
    ['atom', 'sglang', 'tokenspeed', 'trt', 'vllm'],
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
      'Response encoding. csv returns one row per line point or waterfall step, with targetInteractivity, interactivityStatistic and interactivityField. Waterfall rows include JSON-encoded runUrls and prLinks arrays. Frontier rows are one frontier vertex per series and change date.',
      '响应编码。csv 为每个趋势点或瀑布图步骤返回一行，并包含 targetInteractivity、interactivityStatistic 和 interactivityField。瀑布图的 runUrls 和 prLinks 列为 JSON 编码的数组。chart=frontier 时，每行是一条序列在一个变化日期上的一个前沿顶点。',
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
    interactivity: objectSchema({
      statistic: { type: 'string', enum: ['median', 'p90'] },
      field: { type: 'string', enum: ['median_intvty', 'p90_intvty'] },
      unit: { type: 'string', enum: ['tok/s/user'] },
    }),
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
          steps: arraySchema(
            objectSchema({
              kind: { type: 'string', enum: ['baseline', 'gain', 'best'] },
              date: stringSchema,
              from: numberSchema,
              to: numberSchema,
              delta: numberSchema,
              sources: arraySchema(
                objectSchema({
                  date: stringSchema,
                  runId: integerSchema,
                  model: stringSchema,
                  precision: stringSchema,
                  hwKey: stringSchema,
                  benchmarkType: stringSchema,
                  runUrl: stringSchema,
                }),
              ),
              prLinks: arraySchema(stringSchema),
              linksAvailable: booleanSchema,
            }),
          ),
          excludedPointCount: integerSchema,
        },
        ['key', 'hwKey', 'label', 'points'],
      ),
    ),
    count: integerSchema,
    frontier: objectSchema(
      {
        dates: arraySchema({ type: 'string', format: 'date' }),
        levels: arraySchema(numberSchema),
        higherIsBetter: booleanSchema,
        series: arraySchema(
          objectSchema(
            {
              key: stringSchema,
              hwKey: stringSchema,
              precision: { type: ['string', 'null'] },
              vendor: { type: ['string', 'null'] },
              label: stringSchema,
              firstDate: { type: 'string', format: 'date' },
              softwareGain: {
                ...arraySchema({ type: ['number', 'null'] }),
                description:
                  'Same-hardware gain on each date (aligned with dates): the series area divided by its area on its first snapshot, null before it appears. With groupBy=gpu the chip is fixed, so this is the improvement from software, serving configuration and precision.',
              },
              softwareGainByInteractivity: {
                ...arraySchema(
                  objectSchema({ x: numberSchema, ratio: { type: ['number', 'null'] } }),
                ),
                description:
                  'On the latest date, the series frontier over its first-snapshot frontier at the 12 comparison buckets, read off the drawn monotone curves; null where either curve does not reach.',
              },
              softwareGainAverage: {
                type: ['number', 'null'],
                description:
                  'Average of softwareGainByInteractivity: the geometric mean of the non-null ratios, so a 2x gain and a 0.5x loss cancel; null when no bucket is reached on both dates. The Software gains table shows it as the Average column.',
              },
              areas: {
                ...arraySchema(numberSchema),
                description:
                  'Area under the frontier on each date (aligned with dates): the dominance step function integrated from zero to the fastest vertex. Lower-is-better metrics integrate the reciprocal so larger is always better. 0 before the first observation.',
              },
              changes: arraySchema(
                objectSchema({
                  date: { type: 'string', format: 'date' },
                  vertices: arraySchema(
                    objectSchema({
                      x: numberSchema,
                      y: numberSchema,
                      conc: numberSchema,
                      precision: stringSchema,
                      measured: { type: 'string', format: 'date' },
                      runUrl: { type: ['string', 'null'] },
                      config: stringSchema,
                      image: { type: ['string', 'null'] },
                    }),
                  ),
                }),
              ),
            },
            ['key', 'hwKey', 'label', 'changes'],
          ),
        ),
        overtakes: arraySchema(
          objectSchema({
            date: { type: 'string', format: 'date' },
            dateIndex: integerSchema,
            winner: stringSchema,
            loser: stringSchema,
            from: numberSchema,
            to: numberSchema,
            levelCount: integerSchema,
            multiplier: { type: ['number', 'null'] },
            kind: {
              type: 'string',
              enum: ['new-hardware', 'improvement', 'incumbent-regressed', 'tie'],
            },
            heldDays: integerSchema,
            ongoing: booleanSchema,
            brief: booleanSchema,
          }),
        ),
        territory: arraySchema(
          objectSchema({
            date: { type: 'string', format: 'date' },
            shares: arraySchema(
              objectSchema({
                key: stringSchema,
                share: numberSchema,
                from: numberSchema,
                to: numberSchema,
              }),
            ),
          }),
        ),
        otherPrecisionVendors: {
          ...arraySchema(
            objectSchema({
              vendor: stringSchema,
              precisions: arraySchema(stringSchema),
              hardware: arraySchema(stringSchema),
            }),
          ),
          description:
            'Vendors with data for this metric only at precisions outside the resolved precisions, with those precisions and chips, so a client can add a precision instead of treating the vendor as missing.',
        },
        chapters: {
          ...arraySchema(
            objectSchema({
              date: { type: 'string', format: 'date' },
              dateIndex: integerSchema,
              track: { type: ['string', 'null'] },
              driver: stringSchema,
              change: { type: ['number', 'null'] },
              peak: {
                oneOf: [{ type: 'null' }, objectSchema({ x: numberSchema, ratio: numberSchema })],
              },
              cause: {
                type: 'string',
                enum: ['new-series', 'new-config', 'software-update', 'rerun', 'regression'],
              },
              configs: arraySchema(stringSchema),
              image: {
                oneOf: [
                  { type: 'null' },
                  objectSchema({
                    from: { type: ['string', 'null'] },
                    to: { type: ['string', 'null'] },
                  }),
                ],
              },
            }),
          ),
          description:
            'Dates where the pooled frontier of every series stepped by at least 10% of its area, with the series that moved it (driver), the change, the largest single-interactivity move and the cause: new-series (the driver first appears), new-config (a configuration new to its frontier), software-update (same configurations, different serving image, with from/to), rerun, or regression (the configuration whose serving image changed, with from/to, else the configuration that lost most of its frontier).',
        },
        regressions: {
          ...arraySchema(
            objectSchema({
              key: stringSchema,
              bestDate: { type: 'string', format: 'date' },
              change: numberSchema,
              peak: {
                oneOf: [{ type: 'null' }, objectSchema({ x: numberSchema, ratio: numberSchema })],
              },
              config: { type: ['string', 'null'] },
              image: {
                oneOf: [
                  { type: 'null' },
                  objectSchema({
                    from: { type: ['string', 'null'] },
                    to: { type: ['string', 'null'] },
                  }),
                ],
              },
            }),
          ),
          description:
            'Series whose frontier on the latest date covers at least 10% less area than at its best so far. The frontier follows the latest full sweeps, so a re-run that measured lower replaces a better curve; each entry gives the date of the best frontier (bestDate), the area now over the best (change), the largest single-interactivity drop against the best curve (peak), and the configuration behind it: the one whose serving image changed, with the image at the best and now, else the one that lost most of the frontier.',
        },
        comparison: {
          oneOf: [
            { type: 'null' },
            objectSchema(
              {
                keys: arraySchema(stringSchema),
                chapters: arraySchema(
                  objectSchema({
                    date: { type: 'string', format: 'date' },
                    dateIndex: integerSchema,
                    track: { type: ['string', 'null'] },
                    driver: stringSchema,
                    change: { type: ['number', 'null'] },
                    peak: {
                      oneOf: [
                        { type: 'null' },
                        objectSchema({ x: numberSchema, ratio: numberSchema }),
                      ],
                    },
                    cause: {
                      type: 'string',
                      enum: ['new-series', 'new-config', 'software-update', 'rerun', 'regression'],
                    },
                    configs: arraySchema(stringSchema),
                    image: {
                      oneOf: [
                        { type: 'null' },
                        objectSchema({
                          from: { type: ['string', 'null'] },
                          to: { type: ['string', 'null'] },
                        }),
                      ],
                    },
                  }),
                ),
                buckets: arraySchema(numberSchema),
                margins: arraySchema(
                  objectSchema({
                    date: { type: 'string', format: 'date' },
                    margins: arraySchema(
                      objectSchema({
                        x: numberSchema,
                        leader: { type: ['string', 'null'] },
                        runnerUp: { type: ['string', 'null'] },
                        ratio: { type: ['number', 'null'] },
                      }),
                    ),
                  }),
                ),
              },
              ['keys', 'chapters', 'buckets', 'margins'],
            ),
          ],
        },
      },
      [
        'dates',
        'levels',
        'higherIsBetter',
        'series',
        'overtakes',
        'territory',
        'otherPrecisionVendors',
        'regressions',
        'chapters',
        'comparison',
      ],
    ),
  },
  [
    'view',
    'apiVersion',
    'params',
    'metric',
    'target',
    'interactivity',
    'hwKeysWithData',
    'series',
    'count',
  ],
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
  interactivity: { statistic: 'median', field: 'median_intvty', unit: 'tok/s/user' },
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
      '按硬件配置给出的按日期排序趋势线，在目标交互性处插值。',
    ),
    schema: responseSchema,
    example: responseExample,
    mediaType: 'application/json',
    alternateRepresentations: [
      {
        mediaType: 'text/csv',
        schema: stringSchema,
        example:
          'key,hwKey,precision,label,vendor,date,value,synthetic,targetInteractivity,interactivityStatistic,interactivityField\r\nh200_trt,h200_trt,,H200 (TRTLLM),NVIDIA,2026-07-01,310.4,false,35,median,median_intvty',
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
      'Returns the Historical Trends dashboard lines computed server-side: for every benchmark snapshot date, the selected metric is interpolated at the target interactivity per hardware config (per precision when several are selected), then assembled into date-sorted trend lines. Interpolation uses the same monotone-spline math as the dashboard. Lines are extended to extendToDate (current UTC date by default), using a synthetic copy of their last value marked synthetic: true. Pass extendToDate explicitly for reproducible snapshots. chart=frontier returns the data behind the Frontier, Compare and Software gains views instead, computed by the same function the dashboard uses; its series array is empty and the data is in frontier.',
      '返回服务端计算的 Historical Trends 仪表盘趋势线：在每个基准快照日期上，对每个硬件配置（选择多个精度时按精度分线）在目标交互速率处对所选指标插值，再组装为按日期排序的趋势线。插值与仪表盘使用相同的单调样条数学。曲线补齐至 extendToDate（默认当前 UTC 日期），补齐点标为 synthetic: true。需要可复现的快照时请显式指定 extendToDate。chart=frontier 改为返回“前沿”“对比”“软件提升”视图背后的数据，计算函数与仪表盘相同；此时 series 为空数组，数据位于 frontier 字段。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters,
    responses,
    responseShapeName: 'HistoricalView',
    curlUrl: `${API_BASE_URL}/api/v1/views/historical?model=DeepSeek-V4-Pro&metric=y_tpPerGpu&target=35`,
  },
];
