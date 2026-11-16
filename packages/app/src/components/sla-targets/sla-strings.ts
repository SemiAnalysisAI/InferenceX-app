import type {
  SlaAccountingReason,
  SlaDurationSource,
  SlaExclusionCategory,
  SlaLoadKind,
  SlaQualificationReason,
} from '@semianalysisai/inferencex-constants';

import type { Locale } from '@/lib/i18n/i18n';
import type { SlaRowStatus } from '@/lib/sla-targets/view';

const en = {
  heading: 'SLA targets',
  lead: (kind: SlaLoadKind) =>
    `Type the latency you need. See which setups deliver it, how many ${
      kind === 'agentx_users' ? 'users' : 'concurrent requests'
    } each carries, and what it costs.`,
  explanation:
    'Evaluates benchmark results against your service targets. Results apply to the tested workload and conditions; they do not guarantee production SLA compliance.',
  capturedSnapshot: (runs: number, date: string) =>
    `Captured results: ${runs} benchmark ${runs === 1 ? 'run' : 'runs'} read from GitHub Actions artifacts on ${date}. Not live data.`,
  errorText: 'Failed to load SLA target data',
  loading: 'Loading benchmark results…',
  noConfigs: 'No benchmark results are available for this model and workload',

  targetsLegend: 'Your targets',
  ttftClause: { before: 'First token within', unit: 'ms' },
  tpotClause: { before: 'each token within', unit: 'ms' },
  shareClause: { before: 'for at least', unit: '%', after: 'of requests' },
  e2eClause: { before: 'Whole response within', unit: 's', placeholder: 'no limit' },
  more: 'More',
  moreActive: (seconds: string) => `· whole response within ${seconds} s`,
  exampleNote: 'The starting values are an example, not a recommendation.',
  model: 'Model',
  workload: 'Workload',
  workloadAgentic: 'AgentX agentic traces',
  workloadFixed: (sequence: string) => `Fixed sequence ${sequence}`,
  costBasis: 'GPU price',
  costHyperscaler: 'Owning at hyperscaler volume',
  costRental: 'Renting, 3-year commitment',
  invalidTarget: 'Enter a number greater than 0',
  invalidShare: 'Enter a number from 50 to 99.99',

  summaryLoading: (total: number) => `Checking ${total} ${total === 1 ? 'setup' : 'setups'}…`,
  summaryMeets: (meeting: number, total: number) =>
    `${meeting} of ${total} ${total === 1 ? 'setup' : 'setups'} ${
      meeting === 1 ? 'meets' : 'meet'
    } your targets`,
  summaryNone: 'No setup meets your targets',
  summaryCheapest: (setup: string, cost: string) =>
    `Cheapest: ${setup}, ${cost} per 1,000 good requests.`,
  summaryClosest: (setup: string, percent: string, load: string, required: string) =>
    `Closest: ${setup}, ${percent} of requests within target at ${load} (need ${required}).`,

  definitions: 'How results are computed',
  defAttainmentTerm: 'Attainment',
  defAttainment:
    'Passing attempts divided by all attempts dispatched in the profiling window. An attempt passes only when it completed and met every enabled target itself. Failed attempts, and attempts still in flight when the run was cut off, count against it.',
  defGoodputTerm: 'Goodput',
  defGoodput:
    'Passing attempts per second of the configured profiling window. The achieved request rate, shown per load point, counts every completed attempt.',
  defLoadTerm: 'Load',
  defLoadAgentic:
    'AgentX load is the number of replay lanes, each one simulated user replaying a session. Targets are checked per request, not per session. The tests are closed-loop, so a result does not show capacity at a given request arrival rate.',
  defLoadFixed:
    'Fixed-sequence load is the limit on requests in flight at once. The tests are closed-loop, so a result does not show capacity at a given request arrival rate.',
  defVerdictTerm: 'Verdict',
  defVerdict: (minimum: number) =>
    `A load point needs at least ${minimum.toLocaleString('en-US')} attempts at this required attainment, a rule of thumb rather than a confidence bound. Without a full count of dispatched attempts a result is exploratory and never ranked.`,

  defTtftTerm: 'First-token time (TTFT)',
  defTtft:
    'Longest acceptable time to first token for one request. Any positive number; it is used exactly as entered.',
  defTpotTerm: 'Per-token time (TPOT)',
  defTpot:
    'Average decode time per output token within a request, not a bound on every token gap. A request with a single output token has no TPOT, so this target does not apply to it.',
  defE2eTerm: 'Whole-response time (end-to-end latency)',
  defE2e:
    'Longest acceptable time from sending a request to its last byte. No limit by default: agentic requests vary widely in length.',
  defCostTerm: 'Estimated cost',
  defCost: (price: string) =>
    `GPU cost per 1,000 compliant requests, called good requests on the page, at the ${price} price. Every GPU is billed for the whole configured window; warmup and grace time are not billed.`,

  colSetup: 'Setup',
  colStatus: 'Status',
  colMaxLoad: {
    agentx_users: 'Max users at target',
    request_concurrency: 'Max concurrent requests at target',
  } satisfies Record<SlaLoadKind, string>,
  colGoodCost: 'Est. cost per 1,000 good requests',
  colAttainment: 'Attainment',
  colGoodput: 'Goodput',
  shareMeets: (percent: string, load: string, required: string) =>
    `${percent} of requests within target at ${load} (need ${required})`,
  shareBest: (percent: string, load: string, required: string) =>
    `Best: ${percent} of requests within target at ${load} (need ${required})`,
  howMeasured: 'How this was measured',
  compare: 'Compare setups at every tested load',
  statusLabel: {
    meets: 'Meets target',
    misses: 'Misses target',
    insufficient_data: 'Insufficient data',
    loading: 'Evaluating…',
  } satisfies Record<SlaRowStatus, string>,
  exploratory: 'Exploratory',
  exploratoryReason: (reason: string) => `Exploratory: ${reason}`,
  listSeparator: ', ',
  labelled: (label: string, value: string) => `${label}: ${value}`,
  lowerLoadMissed: 'A lower tested load missed',
  smallSample: 'Small sample',
  at: (load: string) => `at ${load}`,
  load: (kind: SlaLoadKind, value: number) =>
    kind === 'agentx_users'
      ? `${value.toLocaleString('en-US')} ${value === 1 ? 'user' : 'users'}`
      : `${value.toLocaleString('en-US')} concurrent ${value === 1 ? 'request' : 'requests'}`,
  loadUnit: (kind: SlaLoadKind, value: number) =>
    kind === 'agentx_users'
      ? value === 1
        ? 'user'
        : 'users'
      : `concurrent ${value === 1 ? 'request' : 'requests'}`,
  loadAxis: {
    agentx_users: 'Replay lanes (simulated users)',
    request_concurrency: 'Request concurrency limit',
  } satisfies Record<SlaLoadKind, string>,
  reason: {
    attainment_met: '',
    attainment_below_required: '',
    service_failure: 'The service failed at this load',
    invalid_measurement: 'The benchmark measurement was invalid',
    failure_undetermined: 'The job failed and its records do not say why',
    attempt_population_not_established: 'The number of dispatched attempts is not established',
    measurement_incomplete: 'The measurement did not complete',
    below_minimum_sample: 'Too few attempts for a verdict',
    outcomes_unresolved: 'The verdict depends on attempts whose outcome is unknown',
    no_request_level_data: 'No request-level data',
    request_columns_omitted: 'Per-request records were left out of the stored result for size',
    request_records_unreadable: 'The per-request records could not be read',
    no_eligible_attempts: 'No eligible attempts',
  } satisfies Record<SlaQualificationReason, string>,
  /** The same reasons in plain words, for the line under a status. */
  plainReason: {
    attainment_met: '',
    attainment_below_required: '',
    service_failure: 'The service failed at this load',
    invalid_measurement: 'The measurement was invalid',
    failure_undetermined: 'The run failed and did not record why',
    attempt_population_not_established: 'The run did not record how many requests it sent',
    measurement_incomplete: 'The run did not finish',
    below_minimum_sample: 'Too few requests to judge',
    outcomes_unresolved: 'Too many requests have no recorded outcome',
    no_request_level_data: 'No per-request data for this run',
    request_columns_omitted: 'Per-request data was not stored for this run',
    request_records_unreadable: 'The per-request data could not be read',
    no_eligible_attempts: 'No requests to judge',
  } satisfies Record<SlaQualificationReason, string>,

  selectionsHeading: 'Headline values',
  selHighestLoad: 'Highest tested passing load',
  selHighestGoodput: 'Highest goodput among qualifying loads',
  selLowestCost: 'Lowest est. cost per 1,000 compliant requests among qualifying loads',
  selNone: 'No tested load qualifies.',
  bestObserved: (percent: string, load: string) =>
    `Best observed attainment: ${percent} at ${load}`,
  pointsHeading: 'Tested loads',
  colPointLoad: 'Load',
  colPointAttempts: 'Attempts',
  colPointPassing: 'Passing',
  colPointAchieved: 'Achieved rate',
  colPointCost: 'Est. cost per 1,000',
  colPointAccounting: 'Attempt accounting',
  supports: {
    highestPassingLoad: 'highest passing load',
    highestGoodput: 'highest goodput',
    lowestCost: 'lowest cost',
  },
  excludingCutoff: (percent: string) => `${percent} without attempts cut off in flight`,
  upperBound: (percent: string) => `up to ${percent} if unknown outcomes passed`,
  accounting: {
    reconciled: 'Every dispatched attempt is accounted for',
    outcomes_unknown: 'Some dispatched attempts have no recorded outcome',
    dispatch_count_unavailable: 'Dispatched count not recorded: a lower bound',
    outcomes_not_explicit: 'Outcomes inferred from the request timeline',
    records_exceed_dispatched: 'More records than dispatched attempts',
    measurement_incomplete: 'Incomplete measurement: the records do not cover the whole run',
    no_attempt_records: 'No attempt records',
  } satisfies Record<SlaAccountingReason, string>,
  breakdown: {
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
    incomplete: 'cut off in flight',
    unknown: 'unknown outcome',
    missingTelemetry: 'completed without a needed value',
    unconfirmed: 'stream ended without completion evidence',
    skipped: 'dropped before dispatch',
    overflow: 'rejected for context overflow',
    overflowOverLimit: 'above the 1% validity limit',
    warmup: 'warmup excluded',
  },
  exclusion: {
    service_failure: 'Failed: service failure',
    invalid_measurement: 'Excluded: invalid measurement',
    undetermined: 'Failed: cause not recorded',
  } satisfies Record<SlaExclusionCategory, string>,
  attempt: (number: number) => `run attempt ${number}`,
  observedFailures: 'Failures in the partial export',
  jobLink: 'Job',

  provenanceHeading: 'Source',
  provRun: 'Benchmark run',
  provDate: 'Run date',
  provCommit: 'Benchmark commit',
  provDataset: 'Replayed dataset',
  provImage: 'Serving image',
  provHarness: 'Load generator',
  provWindow: 'Accounting window',
  provPolicy: 'Evaluation',
  provArtifacts: 'Artifacts',
  window: (seconds: string, source: string) => `${seconds} s (${source})`,
  durationSource: {
    configured_window: 'configured profiling window',
    phase_elapsed: 'phase elapsed time',
    client_reported: 'duration reported by the client',
    attempt_span: 'first attempt start to last attempt end',
  } satisfies Record<SlaDurationSource, string>,
  windowOthers: (elapsed: string | null, client: string | null) =>
    [
      elapsed === null ? null : `phase ran ${elapsed} s including grace`,
      client === null ? null : `client throughput duration ${client} s`,
    ]
      .filter((part) => part !== null)
      .join('; '),
  policy: (evaluator: number, policy: number) =>
    `evaluator v${evaluator}, accounting policy v${policy}`,
  noFailedPointsLive: 'Failed load points are not stored, so none are listed.',

  chartAttainment: 'Attainment by load',
  chartAttainmentSub: 'Share of attempts that met every enabled target, at each tested load',
  chartGoodput: 'Goodput by load',
  chartGoodputSub: 'Passing attempts per second of the profiling window, at each tested load',
  chartLegend:
    'Filled points meet the targets. Hollow points do not, or have no verdict. A cross at the top marks a tested load that failed or was excluded: it has no measurement and is not zero.',
  requiredLine: (percent: string) => `Required ${percent}`,
  axisAttainment: 'Attainment (%)',
  axisGoodput: 'Goodput (req/s)',
  chartEmpty: 'No load point has request-level data',
  tipAttainment: 'attainment',
  tipGoodput: 'goodput',
  tipAttempts: 'attempts',

  costNoPrice: 'no price on file',
  gpuPrice: (usd: string, gpus: number) =>
    `${usd} per GPU-hour × ${gpus} ${gpus === 1 ? 'GPU' : 'GPUs'}`,
  reqPerSecond: 'req/s',
};

const zh: typeof en = {
  heading: 'SLA 目标',
  lead: (kind) =>
    `填入你需要的延迟，即可看到哪些配置能够达标、各自最多能承载多少${
      kind === 'agentx_users' ? '用户' : '并发请求'
    }，以及成本是多少。`,
  explanation:
    '根据你设定的服务目标评估基准测试结果。结果仅适用于所测试的工作负载和条件，不保证生产环境的 SLA 合规。',
  capturedSnapshot: (runs, date) =>
    `已采集的结果：${date} 从 GitHub Actions 产物读取的 ${runs} 次基准测试运行，并非实时数据。`,
  errorText: '加载 SLA 目标数据失败',
  loading: '正在加载基准测试结果……',
  noConfigs: '该模型和工作负载暂无基准测试结果',

  targetsLegend: '你的目标',
  ttftClause: { before: '首 token 不超过', unit: 'ms' },
  tpotClause: { before: '每个 token 不超过', unit: 'ms' },
  shareClause: { before: '至少', unit: '%', after: '的请求达标' },
  e2eClause: { before: '整个响应不超过', unit: 's', placeholder: '不限' },
  more: '更多',
  moreActive: (seconds) => `· 整个响应不超过 ${seconds} s`,
  exampleNote: '初始值只是示例，并非推荐值。',
  model: '模型',
  workload: '工作负载',
  workloadAgentic: 'AgentX 智能体轨迹',
  workloadFixed: (sequence) => `固定序列 ${sequence}`,
  costBasis: 'GPU 价格',
  costHyperscaler: '自有设备 · 超大规模云厂商批量采购',
  costRental: '租赁设备 · 3 年承诺',
  invalidTarget: '请输入大于 0 的数字',
  invalidShare: '请输入 50 到 99.99 之间的数字',

  summaryLoading: (total) => `正在评估 ${total} 个配置……`,
  summaryMeets: (meeting, total) => `${total} 个配置中有 ${meeting} 个达标`,
  summaryNone: '没有配置达标',
  summaryCheapest: (setup, cost) => `成本最低：${setup}，每千次达标请求 ${cost}。`,
  summaryClosest: (setup, percent, load, required) =>
    `最接近：${setup}，${load}时 ${percent} 的请求达标（要求 ${required}）。`,

  definitions: '结果的计算方式',
  defAttainmentTerm: '达标率',
  defAttainment:
    '达标的请求尝试数除以 profiling 窗口内发出的全部请求尝试数。一次尝试只有在完成且自身满足全部已启用目标时才算达标。失败的尝试，以及运行截止时仍在途的尝试，都计入分母且不算达标。',
  defGoodputTerm: 'Goodput',
  defGoodput:
    '配置的 profiling 窗口内每秒达标的请求尝试数。各负载点另行给出的实际请求速率则统计所有已完成的尝试。',
  defLoadTerm: '负载',
  defLoadAgentic:
    'AgentX 的负载是回放通道数，每个通道模拟一个回放会话的用户。目标按请求逐个判定，而不是按会话判定。测试为闭环负载，结果不能说明在给定请求到达速率下的容量。',
  defLoadFixed:
    '固定序列的负载是同时在途请求数的上限。测试为闭环负载，结果不能说明在给定请求到达速率下的容量。',
  defVerdictTerm: '判定',
  defVerdict: (minimum) =>
    `在当前要求的达标率下，一个负载点至少需要 ${minimum.toLocaleString('en-US')} 次请求尝试才能判定；这是经验规则，不是置信区间。无法确定已发出的尝试总数时，结果只作探索性展示，不参与排名。`,

  defTtftTerm: '首 token 时间（TTFT）',
  defTtft: '单个请求可接受的最长首 token 时间。可填任意正数，按输入值原样使用。',
  defTpotTerm: '每 token 时间（TPOT）',
  defTpot:
    '单个请求内每个输出 token 的平均解码时间，并不约束每两个 token 之间的间隔。只有一个输出 token 的请求没有 TPOT，该目标对它不适用。',
  defE2eTerm: '整个响应时间（端到端延迟）',
  defE2e: '从发出请求到收到最后一个字节可接受的最长时间。默认不限：智能体请求的长度差异很大。',
  defCostTerm: '估算成本',
  defCost: (price) =>
    `每千次达标请求的 GPU 成本，按“${price}”价格计算。所有 GPU 按整个配置窗口计费；warmup 和宽限期不计费。`,

  colSetup: '配置',
  colStatus: '状态',
  colMaxLoad: {
    agentx_users: '达标时的最大用户数',
    request_concurrency: '达标时的最大并发请求数',
  },
  colGoodCost: '每千次达标请求的估算成本',
  colAttainment: '达标率',
  colGoodput: 'Goodput',
  shareMeets: (percent, load, required) => `${load}时 ${percent} 的请求达标（要求 ${required}）`,
  shareBest: (percent, load, required) =>
    `最佳：${load}时 ${percent} 的请求达标（要求 ${required}）`,
  howMeasured: '测量方式',
  compare: '对比各配置在每个已测负载下的表现',
  statusLabel: {
    meets: '达标',
    misses: '未达标',
    insufficient_data: '数据不足',
    loading: '评估中……',
  },
  exploratory: '探索性结果',
  exploratoryReason: (reason) => `探索性结果：${reason}`,
  listSeparator: '、',
  labelled: (label, value) => `${label}：${value}`,
  lowerLoadMissed: '有更低的已测负载未达标',
  smallSample: '样本量小',
  at: (load) => `${load}时`,
  load: (kind, value) =>
    kind === 'agentx_users'
      ? `${value.toLocaleString('en-US')} 个用户`
      : `${value.toLocaleString('en-US')} 个并发请求`,
  loadUnit: (kind) => (kind === 'agentx_users' ? '个用户' : '个并发请求'),
  loadAxis: {
    agentx_users: '回放通道数（模拟用户）',
    request_concurrency: '请求并发上限',
  },
  reason: {
    attainment_met: '',
    attainment_below_required: '',
    service_failure: '服务在该负载下发生故障',
    invalid_measurement: '基准测试测量无效',
    failure_undetermined: '任务失败，记录中没有说明原因',
    attempt_population_not_established: '无法确定已发出的请求尝试总数',
    measurement_incomplete: '测量未完成',
    below_minimum_sample: '请求尝试太少，无法判定',
    outcomes_unresolved: '判定取决于结果未知的请求尝试',
    no_request_level_data: '没有逐请求数据',
    request_columns_omitted: '逐请求记录因体积过大未写入存储的结果',
    request_records_unreadable: '逐请求记录无法读取',
    no_eligible_attempts: '没有符合条件的请求尝试',
  },
  plainReason: {
    attainment_met: '',
    attainment_below_required: '',
    service_failure: '服务在该负载下发生故障',
    invalid_measurement: '测量无效',
    failure_undetermined: '运行失败，且没有记录原因',
    attempt_population_not_established: '运行没有记录发出了多少请求',
    measurement_incomplete: '运行未完成',
    below_minimum_sample: '请求太少，无法判定',
    outcomes_unresolved: '太多请求没有记录结果',
    no_request_level_data: '这次运行没有逐请求数据',
    request_columns_omitted: '这次运行的逐请求数据没有保存',
    request_records_unreadable: '逐请求数据无法读取',
    no_eligible_attempts: '没有可供判定的请求',
  },

  selectionsHeading: '关键数值',
  selHighestLoad: '达标的最高已测负载',
  selHighestGoodput: '达标负载中的最高 goodput',
  selLowestCost: '达标负载中每千次达标请求的最低估算成本',
  selNone: '没有已测负载达标。',
  bestObserved: (percent, load) => `观测到的最高达标率：${load}时 ${percent}`,
  pointsHeading: '已测负载',
  colPointLoad: '负载',
  colPointAttempts: '请求尝试数',
  colPointPassing: '达标数',
  colPointAchieved: '实际请求速率',
  colPointCost: '每千次的估算成本',
  colPointAccounting: '请求尝试核算',
  supports: {
    highestPassingLoad: '达标的最高负载',
    highestGoodput: '最高 goodput',
    lowestCost: '最低成本',
  },
  excludingCutoff: (percent) => `不计截止时仍在途的尝试为 ${percent}`,
  upperBound: (percent) => `若结果未知的尝试全部达标，最高为 ${percent}`,
  accounting: {
    reconciled: '所有已发出的请求尝试均已核对',
    outcomes_unknown: '部分已发出的请求尝试没有记录结果',
    dispatch_count_unavailable: '未记录已发出的请求尝试数：仅为下界',
    outcomes_not_explicit: '结果由请求时间线推断',
    records_exceed_dispatched: '记录数多于已发出的请求尝试数',
    measurement_incomplete: '测量未完成：记录未覆盖整次运行',
    no_attempt_records: '没有请求尝试记录',
  },
  breakdown: {
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    incomplete: '截止时仍在途',
    unknown: '结果未知',
    missingTelemetry: '已完成但缺少所需数值',
    unconfirmed: '流结束时没有完成证据',
    skipped: '发出前被丢弃',
    overflow: '因上下文溢出被拒绝',
    overflowOverLimit: '超过 1% 的有效性上限',
    warmup: '已排除的 warmup',
  },
  exclusion: {
    service_failure: '失败：服务故障',
    invalid_measurement: '已排除：测量无效',
    undetermined: '失败：原因未记录',
  },
  attempt: (number) => `第 ${number} 次运行尝试`,
  observedFailures: '不完整导出中的失败',
  jobLink: '任务',

  provenanceHeading: '来源',
  provRun: '基准测试运行',
  provDate: '运行日期',
  provCommit: '基准测试 commit',
  provDataset: '回放数据集',
  provImage: '推理镜像',
  provHarness: '负载生成器',
  provWindow: '核算窗口',
  provPolicy: '评估',
  provArtifacts: '产物',
  window: (seconds, source) => `${seconds} s（${source}）`,
  durationSource: {
    configured_window: '配置的 profiling 窗口',
    phase_elapsed: '阶段实际耗时',
    client_reported: '客户端报告的时长',
    attempt_span: '首个尝试开始到最后一个尝试结束',
  },
  windowOthers: (elapsed, client) =>
    [
      elapsed === null ? null : `阶段含宽限期共运行 ${elapsed} s`,
      client === null ? null : `客户端计算吞吐量所用时长 ${client} s`,
    ]
      .filter((part) => part !== null)
      .join('；'),
  policy: (evaluator, policy) => `评估器 v${evaluator}，核算策略 v${policy}`,
  noFailedPointsLive: '失败的负载点没有入库，因此未列出。',

  chartAttainment: '各负载下的达标率',
  chartAttainmentSub: '每个已测负载下，满足全部已启用目标的请求尝试占比',
  chartGoodput: '各负载下的 goodput',
  chartGoodputSub: '每个已测负载下，profiling 窗口内每秒达标的请求尝试数',
  chartLegend:
    '实心点表示达标；空心点表示未达标或无法判定。顶部的叉号表示该负载已测试但失败或被排除：没有测量结果，不代表数值为零。',
  requiredLine: (percent) => `要求 ${percent}`,
  axisAttainment: '达标率（%）',
  axisGoodput: 'Goodput（req/s）',
  chartEmpty: '没有负载点具有逐请求数据',
  tipAttainment: '达标率',
  tipGoodput: 'goodput',
  tipAttempts: '请求尝试数',

  costNoPrice: '暂无价格',
  gpuPrice: (usd, gpus) => `${usd}/GPU 小时 × ${gpus} 张 GPU`,
  reqPerSecond: 'req/s',
};

export const SLA_STRINGS: Record<Locale, typeof en> = { en, zh };
export type SlaStrings = typeof en;
