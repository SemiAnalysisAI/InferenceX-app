import { TCO_SOURCE_TITLE } from '@semianalysisai/inferencex-constants';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'Agentic Inference Costs',
    // The active tier is not repeated here — the SLO selector below already
    // states it.
    scopeMetric: 'Hyperscaler cost',
    scopeDirection: '↓ Lower is better',
    // The unit is dropped from the visible line but kept for screen readers.
    scopeAria: 'Hyperscaler cost per one million total tokens. Lower is better.',
    sourcePrefix: 'Source: InferenceX & ',
    sourceLinkText: TCO_SOURCE_TITLE,
    tierNavLabel: 'SLO',
    tierUnit: 'tok/s/user',
    engineScopeNavLabel: 'Engine scope',
    engineScopeOptions: {
      all: 'All Platforms',
      community: 'Open Source Community Engines (vLLM/SGLang)',
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
    modelHeader: 'Model · Scenario',
    scenarioLabels: {
      single_turn_8k1k: '8K/1K',
      agentx: 'Long Context Multi-Turn Realistic Agentic Scenario (AgentX)',
    },
    // Rendered in the row header; the full label above stays the accessible
    // name and the hover title, so nothing is lost by not wrapping it to three
    // lines in a 22%-wide column.
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
    // Short forms of the sentences above, for the presentation toolbar. They
    // carry the same verb, so they flip with the scope the same way; the
    // sentence with the count stays on the accessible name.
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
    emptyState: 'No overview results match this selection.',
  },
  zh: {
    title: '智能体推理成本',
    scopeMetric: '超大规模云（hyperscaler）成本',
    scopeDirection: '↓ 越低越好',
    scopeAria: '超大规模云（hyperscaler）每百万总 token 成本，越低越好。',
    sourcePrefix: '来源：InferenceX 与 ',
    sourceLinkText: TCO_SOURCE_TITLE,
    tierNavLabel: 'SLO',
    tierUnit: 'tok/s/用户',
    engineScopeNavLabel: '引擎范围',
    engineScopeOptions: {
      all: '所有平台',
      community: '开源社区引擎（vLLM/SGLang）',
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
    caption: '按各模型标注的场景，基于各平台最佳观测服务包络线计算每百万总 token 成本。',
    historyCaption: (days: number) =>
      `当前成本及其相对 ${days}–${days * 2} 天前最近一次有效平台结果的变化。`,
    modelHeader: '模型 · 场景',
    scenarioLabels: {
      single_turn_8k1k: '8K/1K',
      agentx: '长上下文多轮真实智能体场景（AgentX）',
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
        ? '根据已验证的基准运行结果估算。'
        : `根据已验证的 ${topologies.join(' 与 ')} 运行结果估算。`,
    estimatedAria: (value: string, explanation: string) => `约 ${value}。${explanation}`,
    cellStateLegend: (reference: string) => `— = 无结果。∞ = 缺少 ${reference} 基线。`,
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: '仅 INT4/BF16',
      no_scenario_data: '该场景暂无数据',
      cannot_reach_at_tier: `无法达到 @${tier}`,
      no_exact_at_tier: `无精确 @${tier} 结果`,
    }),
    standardDecodeLabel: 'STP',
    methodologyNote: '若某款芯片不支持 FP4 推测解码，则采用次优的可用配置。',
    costDeltaAria: (pct: string, cheaper: boolean, reference: string) =>
      `比 ${reference} ${cheaper ? '便宜' : '昂贵'} ${pct}`,
    costDeltaEvenAria: (reference: string) => `与 ${reference} 成本基本持平`,
    noBaselineAria: (reference: string) => `缺少可比较的 ${reference} 基线`,
    historicalDeltaAria: (pct: string, cheaper: boolean, baselineDate: string) =>
      `比该平台 ${baselineDate} 的结果${cheaper ? '便宜' : '昂贵'} ${pct}`,
    historicalEvenAria: (baselineDate: string) => `与该平台 ${baselineDate} 的结果成本基本持平`,
    historyCellStateLegend: (days: number) => `缺少有效 ${days} 天对比的平台仅显示当前成本。`,
    referenceHeader: '基准',
    modelScopeNavLabel: '非活跃模型',
    modelScopeShow: '显示已弃用与维护模式模型',
    modelScopeHide: '隐藏已弃用与维护模式模型',
    rowScopeNavLabel: (days: number) => `${days} 天内无变化的行`,
    rowScopeShow: (count: number, days: number) => `显示 ${count} 行 ${days} 天内无变化的数据`,
    rowScopeHide: (count: number, days: number) => `隐藏 ${count} 行 ${days} 天内无变化的数据`,
    hardwareRowScopeNavLabel: '无结果的行',
    hardwareRowScopeShow: (count: number) => `显示 ${count} 行所有平台均无结果的数据`,
    hardwareRowScopeHide: (count: number) => `隐藏 ${count} 行所有平台均无结果的数据`,
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
    categoryBadgeTitle: '该模型已不再进行活跃基准测试。',
    loadingStatus: '正在加载所选对比…',
    navigationError: '无法加载所选对比，当前显示的是上次成功加载的数据。',
    emptyState: '没有符合当前筛选条件的总览结果。',
  },
} as const;

export type OverviewStrings = (typeof OVERVIEW_STRINGS)[OverviewLocale];
