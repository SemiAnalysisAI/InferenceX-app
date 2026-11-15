import { TCO_SOURCE_TITLE } from '@semianalysisai/inferencex-constants';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'Agentic inference costs',
    scopeMetric: 'Hyperscaler cost',
    scopeDirection: '↓ Lower is better',
    scopeAria: 'Hyperscaler cost per one million total tokens. Lower is better.',
    sourcePrefix: 'Source: InferenceX & ',
    sourceLinkText: TCO_SOURCE_TITLE,
    controlsGroup: 'Benchmark config',
    tierNavLabel: 'SLO',
    tierUnit: 'tok/s/user',
    engineScopeNavLabel: 'Engine scope',
    engineScopeOptions: {
      all: 'All platforms',
      community: 'Open-source community engines (vLLM/SGLang)',
    },
    engineScopeShortOptions: {
      all: 'All platforms',
      community: 'Open-source (vLLM/SGLang)',
    },
    comparisonNavLabel: 'Compare',
    comparisonOptions: {
      history: 'Change over time',
    },
    historyWindowOptions: {
      '7d': '1 week ago',
      '30d': '1 month ago',
      '60d': '2 months ago',
      '90d': '3 months ago',
    } as Record<string, string>,
    historyWindowSelectAria: 'Comparison window',
    hardwareComparisonLabel: (reference: string) => `vs ${reference}`,
    referenceSelectorAria: 'Reference hardware',
    caption:
      'Cost per million total tokens from each platform’s best observed serving envelope for the scenario shown with each model.',
    historyCaption: (days: number) =>
      `Current cost and change versus the latest validated platform result ${days}–${days * 2} days earlier.`,
    modelHeader: 'Model · scenario',
    scenarioLabels: {
      single_turn_8k1k: '8K/1K',
      agentx: 'Long-context multi-turn realistic agentic scenario (AgentX)',
    },
    scenarioLabelsShort: {
      single_turn_8k1k: '8K/1K',
      agentx: 'AgentX',
    },
    detailLink: 'View details',
    detailAria: (modelLabel: string, scenarioLabel: string) =>
      `View details: ${modelLabel} · ${scenarioLabel}`,
    compareCurvesLink: 'Compare curves',
    compareCurvesAria: (modelLabel: string, hardwareLabel: string) =>
      `Compare current and historical ${hardwareLabel} cost curves for ${modelLabel}`,
    rawDashboardAria: (evidenceDate: string, modelLabel: string, stack: string) =>
      `Open raw source dashboard for ${evidenceDate}: ${modelLabel} · ${stack}`,
    estimatedTooltip: (topologies: readonly string[]) =>
      topologies.length === 0
        ? 'Estimated from validated benchmark runs.'
        : `Estimated from validated ${topologies.join(' and ')} runs.`,
    estimatedAria: (value: string, explanation: string) => `Approximately ${value}. ${explanation}`,
    cellStateLegend: (reference: string) => `— = no result. ∞ = ${reference} baseline unavailable.`,
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: 'INT4/BF16 only',
      no_scenario_data: 'no data for this scenario',
      cannot_reach_at_tier: `cannot reach @${tier}`,
      no_exact_at_tier: `no exact @${tier} result`,
    }),
    standardDecodeLabel: 'STP',
    methodologyNote:
      'If a chip does not have FP4 spec decoding available, the next best available configuration is used.',
    costDeltaAria: (pct: string, cheaper: boolean, reference: string) =>
      `${pct} ${cheaper ? 'cheaper' : 'more expensive'} than ${reference}`,
    costDeltaEvenAria: (reference: string) => `About the same cost as ${reference}`,
    noBaselineAria: (reference: string) => `No ${reference} baseline to compare against`,
    historicalDeltaAria: (pct: string, cheaper: boolean, baselineDate: string) =>
      `${pct} ${cheaper ? 'cheaper' : 'more expensive'} than this platform’s ${baselineDate} result`,
    historicalEvenAria: (baselineDate: string) =>
      `About the same cost as this platform’s ${baselineDate} result`,
    historyCellStateLegend: (days: number) =>
      `Platforms without a valid ${days}-day comparison show current cost only.`,
    referenceHeader: 'Reference',
    noResultsRow: 'No results at this SLO',
    modelScopeNavLabel: 'Inactive models',
    modelScopeShow: 'Show deprecated & maintenance-mode models',
    modelScopeHide: 'Hide deprecated & maintenance-mode models',
    rowScopeNavLabel: (days: number) => `Rows without a ${days}-day change`,
    rowScopeShow: (count: number, days: number) =>
      `Show ${count} ${count === 1 ? 'row' : 'rows'} with no ${days}-day change`,
    rowScopeHide: (count: number, days: number) =>
      `Hide ${count} ${count === 1 ? 'row' : 'rows'} with no ${days}-day change`,
    hardwareRowScopeNavLabel: 'Rows with no result',
    hardwareRowScopeShow: (count: number) =>
      `Show ${count} ${count === 1 ? 'row' : 'rows'} with no result on any platform`,
    hardwareRowScopeHide: (count: number) =>
      `Hide ${count} ${count === 1 ? 'row' : 'rows'} with no result on any platform`,
    rowScopeChipHide: 'Hide unchanged',
    rowScopeChipShow: 'Show all rows',
    hardwareRowScopeChipHide: 'Hide blanks',
    hardwareRowScopeChipShow: 'Show all rows',
    modelScopeChipShow: 'Show inactive',
    modelScopeChipHide: 'Hide inactive',
    presentEnter: 'Present',
    presentExit: 'Exit',
    presentEnterAria: 'Show the matrix full screen',
    presentExitAria: 'Leave full screen',
    presentShortcutHint: 'Arrow keys switch views · Esc exits',
    categoryBadges: {
      maintenance: 'Maintenance',
      deprecated: 'Deprecated',
    } as Partial<Record<string, string>>,
    categoryBadgeTitle: 'Model is no longer actively benchmarked.',
    loadingStatus: 'Loading the selected comparison…',
    navigationError:
      'Could not load the selected comparison. Showing the last successfully loaded data.',
    emptyState: 'No overview results match this selection',
    apiSourceSuffix: 'Official API prices: each model developer’s own pricing page',
    apiHeader: 'Official API',
    apiHeaderTitle:
      'First-party API list price for the same model, converted to $ per million total tokens on the row’s workload. A reference point, not a GPU platform.',
    apiUnavailable: {
      no_official_api: 'No first-party API price is recorded for this model.',
      tier_mix_unknown:
        'The API bills by input-length tier and the per-tier token split for this workload is not measured.',
    } as Record<string, string>,
    apiUnavailableAria: (reason: string) => `No official API price. ${reason}`,
    apiMixLabels: {
      agentx_full: 'AgentX corpus',
      agentx_256k: 'AgentX 256K corpus',
      single_turn_8k1k: '8K/1K',
    } as Record<string, string>,
    apiFlatTooltip: (p: {
      provider: string;
      apiModelId: string;
      cacheHit: string | null;
      input: string;
      output: string;
      mixLabel: string;
      cached: string;
      uncached: string;
      outputShare: string;
      formula: string;
      result: string;
      note: string;
      asOf: string;
    }) =>
      `${p.provider} ${p.apiModelId}: ${p.cacheHit === null ? '' : `${p.cacheHit} cache hit / `}${p.input} input / ${p.output} output per 1M tokens. ${p.mixLabel} mix: ${p.cached} cached input, ${p.uncached} uncached input, ${p.outputShare} output. ${p.formula} = ${p.result} per 1M total tokens. ${p.note} As of ${p.asOf}.`,
    apiTieredTooltip: (p: {
      provider: string;
      apiModelId: string;
      tiers: string;
      mixLabel: string;
      split: string;
      result: string;
      note: string;
      asOf: string;
    }) =>
      `${p.provider} ${p.apiModelId}, billed per request by input length: ${p.tiers} (input / output per 1M tokens). ${p.mixLabel}: ${p.split}. Total ${p.result} per 1M total tokens. ${p.note} As of ${p.asOf}.`,
    apiTierRange: (lo: string, hi: string) => `${lo}–${hi} input`,
    apiTierUpTo: (hi: string) => `≤${hi} input`,
    apiTierSplit: (range: string, input: string, output: string) =>
      `${range} requests carry ${input} of input and ${output} of output tokens`,
    apiRatioCheaper: (n: string) => `×${n} cheaper than API`,
    apiRatioPricier: (n: string) => `×${n} pricier than API`,
    apiRatioEven: 'About the API price',
    apiRatioTooltip: (hardware: string, hw: string, api: string, verdict: string) =>
      `${hardware} self-hosted ${hw} vs official API ${api} per 1M total tokens on this workload: ${verdict}.`,
    apiMethodologyNote:
      'Official API: the model developer’s own list price, never a reseller’s, converted with the workload’s cached-input / uncached-input / output token mix. It does not change with the SLO, engine scope, comparison or reference hardware; “Hide unchanged” and “Hide blanks” only remove whole rows, judged by their hardware results. The corpus counts every reusable prefix as a cache hit, so on cached APIs the figure is a lower bound.',
  },
  zh: {
    title: '智能体推理成本',
    scopeMetric: '超大规模云厂商成本',
    scopeDirection: '↓ 越低越好',
    scopeAria: '每百万总 token 的超大规模云厂商（hyperscaler）成本，越低越好。',
    sourcePrefix: '来源：InferenceX 与 ',
    sourceLinkText: TCO_SOURCE_TITLE,
    controlsGroup: '基准测试配置',
    tierNavLabel: 'SLO',
    tierUnit: 'tok/s/user',
    engineScopeNavLabel: '引擎范围',
    engineScopeOptions: {
      all: '所有平台',
      community: '开源社区引擎（vLLM/SGLang）',
    },
    engineScopeShortOptions: {
      all: '所有平台',
      community: '开源（vLLM/SGLang）',
    },
    comparisonNavLabel: '对比方式',
    comparisonOptions: {
      history: '历史变化',
    },
    historyWindowOptions: {
      '7d': '1 周前',
      '30d': '1 个月前',
      '60d': '2 个月前',
      '90d': '3 个月前',
    } as Record<string, string>,
    historyWindowSelectAria: '对比时间窗口',
    hardwareComparisonLabel: (reference: string) => `对比 ${reference}`,
    referenceSelectorAria: '基准硬件',
    caption: '根据各模型标注的测试场景，采用各平台实测的最优服务包络线，计算每百万总 token 成本。',
    historyCaption: (days: number) =>
      `当前成本，以及相较于 ${days}–${days * 2} 天前该平台最近一次有效结果的变化。`,
    modelHeader: '模型 · 场景',
    scenarioLabels: {
      single_turn_8k1k: '8K/1K',
      agentx: '长上下文、多轮交互的真实智能体场景（AgentX）',
    },
    scenarioLabelsShort: {
      single_turn_8k1k: '8K/1K',
      agentx: 'AgentX',
    },
    detailLink: '查看详情',
    detailAria: (modelLabel: string, scenarioLabel: string) =>
      `查看详情：${modelLabel} · ${scenarioLabel}`,
    compareCurvesLink: '对比曲线',
    compareCurvesAria: (modelLabel: string, hardwareLabel: string) =>
      `对比 ${modelLabel} 在 ${hardwareLabel} 上当前与历史成本曲线`,
    rawDashboardAria: (evidenceDate: string, modelLabel: string, stack: string) =>
      `打开 ${evidenceDate} 原始数据仪表板：${modelLabel} · ${stack}`,
    estimatedTooltip: (topologies: readonly string[]) =>
      topologies.length === 0
        ? '根据已验证的基准测试结果估算。'
        : `根据已验证的 ${topologies.join(' 与 ')} 测试结果估算。`,
    estimatedAria: (value: string, explanation: string) => `约 ${value}。${explanation}`,
    cellStateLegend: (reference: string) => `— = 无结果。∞ = 缺少 ${reference} 基线。`,
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: '仅 INT4/BF16',
      no_scenario_data: '该场景暂无数据',
      cannot_reach_at_tier: `无法达到 @${tier}`,
      no_exact_at_tier: `无精确 @${tier} 结果`,
    }),
    standardDecodeLabel: 'STP',
    methodologyNote: '如果某款芯片没有可用的 FP4 投机解码配置，则改用次优配置。',
    costDeltaAria: (pct: string, cheaper: boolean, reference: string) =>
      `成本比 ${reference} ${cheaper ? '低' : '高'} ${pct}`,
    costDeltaEvenAria: (reference: string) => `与 ${reference} 成本基本持平`,
    noBaselineAria: (reference: string) => `缺少可比较的 ${reference} 基线`,
    historicalDeltaAria: (pct: string, cheaper: boolean, baselineDate: string) =>
      `成本比该平台 ${baselineDate} 的结果${cheaper ? '低' : '高'} ${pct}`,
    historicalEvenAria: (baselineDate: string) => `与该平台 ${baselineDate} 的结果成本基本持平`,
    historyCellStateLegend: (days: number) => `缺少有效 ${days} 天对比的平台仅显示当前成本。`,
    referenceHeader: '基准',
    noResultsRow: '此 SLO 下暂无结果',
    modelScopeNavLabel: '非活跃模型',
    modelScopeShow: '显示已弃用与维护模式模型',
    modelScopeHide: '隐藏已弃用与维护模式模型',
    rowScopeNavLabel: (days: number) => `${days} 天内无变化的行`,
    rowScopeShow: (count: number, days: number) => `显示过去 ${days} 天无变化的 ${count} 行数据`,
    rowScopeHide: (count: number, days: number) => `隐藏过去 ${days} 天无变化的 ${count} 行数据`,
    hardwareRowScopeNavLabel: '无结果的行',
    hardwareRowScopeShow: (count: number) => `显示所有平台均无结果的 ${count} 行数据`,
    hardwareRowScopeHide: (count: number) => `隐藏所有平台均无结果的 ${count} 行数据`,
    rowScopeChipHide: '隐藏无变化',
    rowScopeChipShow: '显示全部行',
    hardwareRowScopeChipHide: '隐藏空行',
    hardwareRowScopeChipShow: '显示全部行',
    modelScopeChipShow: '显示停用模型',
    modelScopeChipHide: '隐藏停用模型',
    presentEnter: '演示',
    presentExit: '退出',
    presentEnterAria: '全屏展示矩阵',
    presentExitAria: '退出全屏',
    presentShortcutHint: '方向键切换视图 · Esc 退出',
    categoryBadges: {
      maintenance: '维护模式',
      deprecated: '已弃用',
    } as Partial<Record<string, string>>,
    categoryBadgeTitle: '目前已不再对该模型进行持续基准测试。',
    loadingStatus: '正在加载所选对比…',
    navigationError: '无法加载所选对比，当前显示的是上次成功加载的数据。',
    emptyState: '没有符合当前筛选条件的总览结果',
    apiSourceSuffix: '官方 API 价格：各模型开发商自己的定价页面',
    apiHeader: '官方 API',
    apiHeaderTitle:
      '同一模型的官方（第一方）API 标价，按该行工作负载换算为每百万总 token 美元。仅作参考，不是 GPU 平台。',
    apiUnavailable: {
      no_official_api: '暂无该模型的官方 API 价格记录。',
      tier_mix_unknown: '该 API 按输入长度分档计费，而此工作负载的分档 token 占比尚未测得。',
    } as Record<string, string>,
    apiUnavailableAria: (reason: string) => `无官方 API 价格。${reason}`,
    apiMixLabels: {
      agentx_full: 'AgentX 语料',
      agentx_256k: 'AgentX 256K 语料',
      single_turn_8k1k: '8K/1K',
    } as Record<string, string>,
    apiFlatTooltip: (p: {
      provider: string;
      apiModelId: string;
      cacheHit: string | null;
      input: string;
      output: string;
      mixLabel: string;
      cached: string;
      uncached: string;
      outputShare: string;
      formula: string;
      result: string;
      note: string;
      asOf: string;
    }) =>
      `${p.provider} ${p.apiModelId}：每百万 token ${p.cacheHit === null ? '' : `缓存命中 ${p.cacheHit} / `}输入 ${p.input} / 输出 ${p.output}。${p.mixLabel} token 构成：缓存输入 ${p.cached}，未缓存输入 ${p.uncached}，输出 ${p.outputShare}。${p.formula} = 每百万总 token ${p.result}。${p.note} 截至 ${p.asOf}。`,
    apiTieredTooltip: (p: {
      provider: string;
      apiModelId: string;
      tiers: string;
      mixLabel: string;
      split: string;
      result: string;
      note: string;
      asOf: string;
    }) =>
      `${p.provider} ${p.apiModelId}，按单次请求输入长度分档计费：${p.tiers}（每百万 token 输入 / 输出）。${p.mixLabel}：${p.split}。合计每百万总 token ${p.result}。${p.note} 截至 ${p.asOf}。`,
    apiTierRange: (lo: string, hi: string) => `输入 ${lo}–${hi}`,
    apiTierUpTo: (hi: string) => `输入 ≤${hi}`,
    apiTierSplit: (range: string, input: string, output: string) =>
      `${range} 的请求占输入 token ${input}、输出 token ${output}`,
    apiRatioCheaper: (n: string) => `比 API 便宜 ×${n}`,
    apiRatioPricier: (n: string) => `比 API 贵 ×${n}`,
    apiRatioEven: '与 API 价格相当',
    apiRatioTooltip: (hardware: string, hw: string, api: string, verdict: string) =>
      `${hardware} 自建部署 ${hw}，官方 API ${api}（每百万总 token，同一工作负载）：${verdict}。`,
    apiMethodologyNote:
      '官方 API：模型开发商自己的标价（不含转售商），按工作负载的缓存输入 / 未缓存输入 / 输出 token 构成换算。该列不随 SLO、引擎范围、对比方式或基准硬件变化；“隐藏无变化”与“隐藏空行”只按硬件结果移除整行。语料把所有可复用前缀都计为缓存命中，因此对支持缓存的 API 而言该数值是下限。',
  },
} as const;

export type OverviewStrings = (typeof OVERVIEW_STRINGS)[OverviewLocale];
