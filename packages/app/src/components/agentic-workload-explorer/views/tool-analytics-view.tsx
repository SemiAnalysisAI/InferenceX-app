'use client';

import { Suspense, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HARNESSES,
  isHarness,
  type Harness,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { Button } from '@/components/ui/button';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ToolOsErrorRates,
  type ToolOsErrorRate,
} from '@/components/agentic-workload-explorer/tool-os-error-rates';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import { DistributionHistogram } from '@/components/agentic-workload-explorer/distribution-histogram';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CURSOR_LINE_PROPS } from '@/lib/d3-chart/cursor';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { formatAxisNumber } from '@/components/agentic-workload-explorer/trends-charts';

interface ToolAnalyticsData {
  toolCounts: { toolName: string; count: number }[];
  transitions: { fromTool: string; toTool: string; count: number }[];
  sessionToolStats: { totalTools: number; uniqueTools: number }[];
  toolErrorRates: {
    toolName: string;
    totalCalls: number;
    matchedResults: number;
    successes: number;
    errors: number;
    unknown: number;
    errorRate: number | null;
  }[];
  toolErrorRatesByOs: ToolOsErrorRate[];
  verificationSummary: {
    sessionsAnalyzed: number;
    editedSessions: number;
    noEditSessions: number;
    verifiedEditedSessions: number;
    unverifiedEditedSessions: number;
    verifiedPassSessions: number;
    failRecoveredSessions: number;
    failUnrecoveredSessions: number;
    ambiguousSessions: number;
    verificationAttempts: number;
    verificationAttemptsAfterEdit: number;
    verificationPasses: number;
    verificationFailures: number;
    verificationUnknown: number;
  };
  verificationByKind: {
    kind: 'test' | 'typecheck' | 'lint' | 'build' | 'other';
    attempts: number;
    afterEditAttempts: number;
    passes: number;
    failures: number;
    unknown: number;
    passRate: number | null;
    failureRate: number | null;
  }[];
  sessionOutcomeCounts: {
    outcome:
      | 'no_edit'
      | 'edited_unverified'
      | 'verified_pass'
      | 'fail_recovered'
      | 'fail_unrecovered'
      | 'ambiguous';
    count: number;
  }[];
  toolTimings: ToolTimings;
  cachedAt?: string;
  sample?: { sessions: number; totalSessions: number; requests: number; totalRequests: number };
}

interface ToolTimingStat {
  toolName: string;
  samples: number;
  meanMs: number;
  p25Ms: number;
  p50Ms: number;
  p75Ms: number;
  p90Ms: number;
  p99Ms: number;
}

interface OsToolTimingStat {
  os: string;
  toolName: string;
  samples: number;
  sessions: number;
  p50Ms: number;
  p90Ms: number;
}

interface PlatformToolTimingStat extends OsToolTimingStat {
  arch: string;
}

interface ToolTimings {
  coverage: { toolTurns: number; singleToolTurns: number; batchTurns: number };
  perTool: ToolTimingStat[];
  histogram: { toolName: string; bin: number; count: number }[];
  bashByKind: (Omit<ToolTimingStat, 'toolName'> & { kind: string })[];
  bashKindCounts: { kind: string; count: number }[];
  bashByBinary: (Omit<ToolTimingStat, 'toolName'> & { binary: string })[];
  bashBinaryCounts: { binary: string; count: number }[];
  bashBinaryTotal: number;
  byOs: {
    perTool: OsToolTimingStat[];
    perPlatform: PlatformToolTimingStat[];
    fineHistogram: { os: string; arch: string; toolName: string; bin: number; count: number }[];
  };
}

interface WarmingResponse {
  warming: true;
}

interface SetupRequiredResponse {
  setupRequired: true;
}

type ToolAnalyticsResponse = ToolAnalyticsData | WarmingResponse | SetupRequiredResponse;

interface Bucket {
  min: number;
  max: number;
  count: number;
}

function buildHistogram(values: number[], bucketCount: number): Bucket[] {
  if (values.length === 0) return [];
  const sorted = [...values].toSorted((a, b) => a - b);
  if (sorted[0] === sorted.at(-1)) {
    return [{ min: sorted[0], max: sorted[0], count: values.length }];
  }
  const min = sorted[0];
  const isInteger = sorted.every((v) => Number.isInteger(v));
  if (isInteger) {
    const fullRange = sorted.at(-1)! - min + 1;
    const step = Math.ceil(fullRange / bucketCount);
    if (step <= 4) {
      const count = Math.ceil(fullRange / step);
      const buckets = Array.from({ length: count }, (_, i) => ({
        min: min + i * step,
        max: min + (i + 1) * step,
        count: 0,
      }));
      for (const v of sorted) {
        buckets[Math.min(Math.floor((v - min) / step), count - 1)].count++;
      }
      return buckets;
    }
  }
  const p95Idx = Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1);
  const p95Val = sorted[p95Idx];
  let max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!;
  let step = (max - min) / bucketCount;
  if (isInteger) {
    step = Math.max(1, Math.ceil(step));
    max = min + step * bucketCount;
  }
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of sorted) {
    if (v > max) continue;
    let idx = Math.floor((v - min) / step);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].count++;
  }
  while (buckets.length > 1 && buckets.at(-1)!.count === 0) buckets.pop();
  return buckets;
}

function formatPct(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function isWarmingResponse(value: unknown): value is WarmingResponse {
  return Boolean(value) && typeof value === 'object' && (value as WarmingResponse).warming === true;
}

function isSetupRequiredResponse(value: unknown): value is SetupRequiredResponse {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as SetupRequiredResponse).setupRequired === true
  );
}

function isToolAnalyticsData(value: unknown): value is ToolAnalyticsData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Record<keyof ToolAnalyticsData, unknown>>;
  return (
    Array.isArray(data.toolCounts) &&
    Array.isArray(data.transitions) &&
    Array.isArray(data.sessionToolStats) &&
    Array.isArray(data.toolErrorRates) &&
    Array.isArray(data.toolErrorRatesByOs) &&
    Array.isArray(data.verificationByKind) &&
    Array.isArray(data.sessionOutcomeCounts) &&
    Boolean(data.verificationSummary) &&
    typeof data.verificationSummary === 'object' &&
    Boolean(data.toolTimings) &&
    typeof data.toolTimings === 'object'
  );
}

const OUTCOME_COLORS: Record<ToolAnalyticsData['sessionOutcomeCounts'][number]['outcome'], string> =
  {
    verified_pass: '#10b981',
    fail_recovered: '#0ea5e9',
    fail_unrecovered: '#ef4444',
    edited_unverified: '#f59e0b',
    ambiguous: '#6b7280',
    no_edit: '#94a3b8',
  };

type OutcomeKey = ToolAnalyticsData['sessionOutcomeCounts'][number]['outcome'];

const AGENT_FILTERS = ['all', 'claude', 'codex'] as const;
type AgentFilter = (typeof AGENT_FILTERS)[number];

type HarnessFilter = 'all' | Harness;

const STRINGS = {
  en: {
    sessionOne: 'session',
    sessionOther: 'sessions',
    hideSmall: 'Hide cells under 5',
    hiddenUnderFive: 'Under 5 transitions, hidden',
    matrixScaleCount: 'Transitions',
    matrixScaleProbability: 'Share of row',
    logScale: '(log scale)',
    transitionsUnit: 'transitions',
    ofRowTransitions: 'of transitions from this tool',
    shareOfSamples: 'Share of samples in this bin',
    invocationsCount: (n: string) => `N = ${n} invocations`,
    noTransitionData: 'No transition data',
    workflowPatterns: 'Workflow patterns',
    workflowCacheMissing:
      "Workflow patterns are not yet built for this snapshot — they will appear once the snapshot's tool_analytics_cache is rebuilt.",
    workflowNotAvailable: 'Workflow patterns are not available in this snapshot',
    workflowFetchError: (msg: string) => `Failed to read workflow patterns cache: ${msg}`,
    workflowNotEnough:
      'Not enough data to mine workflow patterns (need sessions with 3+ tool calls)',
    reload: 'Reload',
    reloadWorkflowAriaLabel: 'Reload workflow patterns',
    repeatShare: 'Repeat share',
    repeatShareDetail: 'Tool calls that repeat the previous tool back-to-back',
    longestStreak: 'Longest streak',
    longestStreakDetail: 'Most consecutive calls of a single tool in one session',
    sessionsMined: 'Sessions mined',
    sessionsMinedDetail: (calls: string, steps: string) =>
      `${calls} tool calls → ${steps} collapsed steps`,
    recurringMotifs: 'Recurring motifs',
    motifsSubtitle: (count: number, sessions: string) => `Top ${count} · from ${sessions} sessions`,
    motifsDescription:
      'Consecutive repeats are collapsed (Bash, Bash, Bash → one step) and only contiguous steps count, so each row is a real local workflow instead of a Bash permutation. ×N marks steps that average N repeated calls.',
    toolStreaks: 'Tool streaks',
    toolStreaksDescription:
      'Maximal runs of the same tool called back-to-back — how bursty each tool is. Sessions counts sessions containing a streak of 2+.',
    colTool: 'Tool',
    colCalls: 'Calls',
    colRuns: 'Runs',
    colSessions: 'Sessions',
    pingPongLoops: 'Ping-pong loops',
    pingPongDescription:
      'Alternating A→B→A→B segments of 2+ full cycles — the edit/verify and read/tweak feedback loops. Cycles = A→B round trips per segment.',
    noRecurringLoops: 'No recurring loops found',
    toolWallTime: 'Tool wall-time',
    toolCountDetail: (n: number) => `${n} ${n === 1 ? 'tool' : 'tools'}`,
    turnaroundByTool: 'Turnaround by tool',
    clientSideWallTime: 'Client-side wall time',
    turnaroundByToolDescription: (single: string, total: string, pct: string, batchLabel: string) =>
      `Time between a response ending in one tool_use and the next request in the same session lane carrying its tool_result — tool execution plus harness overhead. Single-tool turns only (${single} of ${total} tool turns, ${pct}%); turns with parallel tool calls are lumped under ${batchLabel}; gaps over 30 minutes are dropped as idle.`,
    turnaroundDistribution: 'Turnaround distribution',
    colSamples: 'Samples',
    colMean: 'Mean',
    turnaroundShapeByOs: 'Turnaround shape by OS',
    splitByArch: 'Split by arch',
    turnaroundShapeDescription:
      'Share of samples per log-spaced bin, normalized per series. Session OS/arch come from client metadata (SDK headers, or the Codex user-agent when headers are absent). Dashed lines mark medians; platforms under 200 samples are hidden.',
    agent: 'Agent',
    tool: 'Tool',
    turnaroundAxisLabel: 'Turnaround (log scale)',
    medianTurnaroundByOs: (splitArch: boolean) =>
      `Median turnaround by ${splitArch ? 'platform' : 'OS'}`,
    toolTurnaroundTitle: (tool: string, splitArch: boolean) =>
      `${tool} turnaround by ${splitArch ? 'OS/arch' : 'OS'}`,
    medianTurnaroundDescription: (splitArch: boolean) =>
      `p50 with p90 below, per tool and ${splitArch ? 'OS/arch' : 'OS'}. Same client-side wall-time samples as the chart — differences are OS + machine + harness overhead, not model latency.`,
    bashBreakdown: 'Bash breakdown',
    bashBreakdownDescription:
      "Split by the verification-kind classification already stored at ingest (raw commands never leave the proxy): test / typecheck / lint / build, everything else is 'other'. Timing columns come from the single-tool-turn samples above.",
    noBashCalls: 'No Bash calls',
    colKind: 'Kind',
    colShare: 'Share',
    bashBinaries: 'Bash — binaries',
    bashBinariesDescription: (count: string) =>
      `Showing ${count} distinct binaries from the current analytics snapshot, sorted by invocation count. Includes shell command positions plus allowlisted verification tools referenced behind runners (for example, uv run pytest). Timing columns come from single-tool-turn samples attributed to the command's first binary.`,
    bashTopBinariesAriaLabel: 'Bash top binaries',
    colBinary: 'Binary',
    colInvocations: 'Invocations',
    batchLabel: '(parallel batch)',
    callsUnit: 'calls',
    allTools: 'All',
    sessionCount: (n: string) => ` · ${n} sess`,
    loadingToolAnalytics: 'Loading tool analytics…',
    cacheTableMissing: 'Tool analytics are not yet built for this snapshot',
    cacheTableMissingDetail:
      "Tool analytics will appear once the snapshot's tool_analytics_cache is rebuilt by the snapshot maintainer.",
    notAvailableInSnapshot: 'Tool analytics are not available in this snapshot',
    notAvailableDetail: 'The frozen snapshot has no precomputed tool analytics for this view.',
    reloadToolAnalyticsAriaLabel: 'Reload tool analytics',
    failedToLoad: 'Failed to load tool analytics',
    retry: 'Retry',
    stats: 'Stats',
    totalToolCalls: 'Total tool calls',
    explicitToolErrorRate: 'Explicit tool error rate',
    errorRateDetail: (errors: string, matched: string) =>
      `${errors} errors / ${matched} matched Anthropic results`,
    verifiedEdited: 'Verified edited',
    verifiedEditedDetail: (verified: string, edited: string) =>
      `${verified} / ${edited} edited sessions`,
    finalVerifiedPass: 'Final verified pass',
    finalVerifiedPassDetail: (n: string) => `${n} edited sessions`,
    uniqueToolTypes: 'Unique tool types',
    sessionsAnalyzed: 'Sessions analyzed',
    avgToolsPerSession: 'Avg tools / session',
    recoveredFailures: 'Recovered failures',
    recoveredFailuresDetail: (recovered: string, total: string) =>
      `${recovered} recovered / ${total} sessions with final failure signal`,
    distribution: 'Distribution',
    toolUsageDistribution: 'Tool usage distribution',
    topTransitions: 'Top transitions',
    transitionMatrix: 'Transition matrix',
    rowNormalizedProbability: 'row-normalized probability',
    rawCounts: 'raw counts',
    showCounts: 'Show counts',
    showProbability: 'Show probability',
    transitionMatrixDescription: (count: number) =>
      `Cell (i, j) = after tool i, tool j was called next. Top ${count} tools by usage.`,
    explicitToolErrorRates: 'Explicit tool error rates',
    anthropicToolResults: 'Anthropic tool results',
    matchedResults: (n: string) => `${n} matched results`,
    anthropicToolResultsDescription:
      'Explicit error rate is errors divided by matched Anthropic tool results. OpenAI and Codex are excluded because their protocol does not carry the same error flag; unmatched Anthropic calls remain unknown.',
    noToolResultData: 'No tool result data',
    anthropicToolResultsAriaLabel: 'Anthropic tool results',
    colMatched: 'Matched',
    colSuccess: 'Success',
    colErrors: 'Errors',
    colUnknown: 'Unknown',
    colErrorRate: 'Error rate',
    verificationLoopAnalysis: 'Verification loop analysis',
    sessionOutcomeProxies: 'Session outcome proxies',
    sessionOutcomeDescription:
      'Session outcomes are proxies: pass/fail means the final recognized verification command after an edit passed or failed, not ground-truth task correctness.',
    verificationCommandClasses: 'Verification command classes',
    noVerificationCommands: 'No recognized verification commands',
    colAttempts: 'Attempts',
    colAfterEdit: 'After edit',
    colPass: 'Pass',
    colFail: 'Fail',
    colFailRate: 'Fail rate',
    agenticLoopDepth: 'Agentic loop depth',
    toolCallsPerSession: 'Tool calls per session',
    uniqueToolsPerSession: 'Unique tools per session',
    toolDiversityRatio: 'Tool diversity ratio (unique / total)',
    axisToolCalls: 'Tool calls',
    axisUniqueTools: 'Unique tools',
    axisRatio: 'Ratio',
    noData: 'No data',
    binsClip: (bins: number, clipped: string) =>
      `${bins} bins${clipped ? ` · ${clipped} sessions above axis (~p95 clip)` : ''}`,
    outcomeLabels: {
      verified_pass: 'Verified pass',
      fail_recovered: 'Fail recovered',
      fail_unrecovered: 'Fail unrecovered',
      edited_unverified: 'Edited unverified',
      ambiguous: 'Ambiguous',
      no_edit: 'No edit',
    } as Record<OutcomeKey, string>,
    agentLabels: { all: 'All', claude: 'Claude Code', codex: 'Codex' } as Record<
      AgentFilter,
      string
    >,
    harnessFilterGroupLabel: 'Harness',
    loopSessions: (sessions: string, pct: string) => `${sessions} sessions (${pct}%)`,
    loopCycles: (p50: number, max: number) => `p50 ${p50} · max ${max} cycles`,
    harnessFilterLabels: {
      all: 'All harnesses',
      'claude-code': 'Claude Code',
      codex: 'Codex',
      pi: 'Pi',
      omp: 'Oh My Pi',
      other: 'Other',
    } as Record<HarnessFilter, string>,
    sessionSample: (
      sessions: string,
      totalSessions: string,
      requests: string,
      totalRequests: string,
    ) =>
      `Session sample: ${sessions} of ${totalSessions} sessions, ${requests} of ${totalRequests} requests`,
  },
  zh: {
    sessionOne: '会话',
    sessionOther: '会话',
    hideSmall: '隐藏少于 5 的单元格',
    hiddenUnderFive: '少于 5 次转换，已隐藏',
    matrixScaleCount: '转换次数',
    matrixScaleProbability: '行内占比',
    logScale: '（对数刻度）',
    transitionsUnit: '次转换',
    ofRowTransitions: '占该工具后续转换',
    shareOfSamples: '该区间的样本占比',
    invocationsCount: (n: string) => `N = ${n} 次调用`,
    noTransitionData: '暂无转换数据',
    workflowPatterns: '工作流模式',
    workflowCacheMissing:
      '当前快照尚未构建工作流模式——待快照的 tool_analytics_cache 重建后自动显示。',
    workflowNotAvailable: '当前快照中无工作流模式数据',
    workflowFetchError: (msg: string) => `读取工作流模式缓存失败：${msg}`,
    workflowNotEnough: '数据不足，无法挖掘工作流模式（需要含 3+ 次工具调用的会话）',
    reload: '重新加载',
    reloadWorkflowAriaLabel: '重新加载工作流模式',
    repeatShare: '重复占比',
    repeatShareDetail: '连续重复调用同一工具的比例',
    longestStreak: '最长连续调用',
    longestStreakDetail: '单会话中同一工具的最大连续调用次数',
    sessionsMined: '已挖掘会话数',
    sessionsMinedDetail: (calls: string, steps: string) =>
      `${calls} 次工具调用 → ${steps} 步（合并后）`,
    recurringMotifs: '常见模式',
    motifsSubtitle: (count: number, sessions: string) => `前 ${count} 个 · 来自 ${sessions} 个会话`,
    motifsDescription:
      '连续重复调用被合并（Bash, Bash, Bash → 一步），且仅统计相邻步骤，因此每行是一个真实的局部工作流而非 Bash 排列组合。×N 表示该步骤平均重复调用 N 次。',
    toolStreaks: '工具连续调用',
    toolStreaksDescription:
      '同一工具被连续调用的最大段——衡量各工具的突发性。会话数列为包含 2+ 次连续调用的会话数。',
    colTool: '工具',
    colCalls: '调用数',
    colRuns: '段数',
    colSessions: '会话数',
    pingPongLoops: '来回循环',
    pingPongDescription:
      '交替 A→B→A→B 的 2+ 完整周期片段——编辑/验证和读取/调整反馈循环。Cycles = 每段 A→B 往返次数。',
    noRecurringLoops: '未发现循环模式',
    toolWallTime: '工具耗时',
    toolCountDetail: (n: number) => `${n} 个工具`,
    turnaroundByTool: '按工具分组的周转时间',
    clientSideWallTime: '客户端耗时',
    turnaroundByToolDescription: (single: string, total: string, pct: string, batchLabel: string) =>
      `从 tool_use 响应结束到同一会话 lane 的下一条 tool_result 请求之间的时间——包含工具执行和 harness 开销。仅统计单工具 turn（${single} / ${total} 个 tool turns，${pct}%）；并行 tool call 的 turn 归入${batchLabel}；超过 30 分钟的间隔视为空闲已排除。`,
    turnaroundDistribution: '周转时间分布',
    colSamples: '样本数',
    colMean: '均值',
    turnaroundShapeByOs: '按操作系统的周转时间分布',
    splitByArch: '按架构拆分',
    turnaroundShapeDescription:
      '按对数间隔 bin 统计的样本占比，各系列独立归一化。会话的 OS/arch 来自客户端元数据（SDK headers；无 headers 时使用 Codex user-agent）。虚线为中位数；样本不足 200 的平台已隐藏。',
    agent: 'Agent',
    tool: '工具',
    turnaroundAxisLabel: '周转时间（对数坐标）',
    medianTurnaroundByOs: (splitArch: boolean) =>
      `按${splitArch ? '平台' : '操作系统'}的中位周转时间`,
    toolTurnaroundTitle: (tool: string, splitArch: boolean) =>
      `${tool} 按${splitArch ? 'OS/arch' : '操作系统'}的周转时间`,
    medianTurnaroundDescription: (splitArch: boolean) =>
      `p50 及下方 p90，按工具和${splitArch ? 'OS/arch' : 'OS'}分组。与图表使用相同的客户端耗时样本——差异来自 OS + 机器 + harness 开销，而非模型延迟。`,
    bashBreakdown: 'Bash 分类统计',
    bashBreakdownDescription:
      "按写入时已存储的验证类型分类（原始命令不出代理）：test / typecheck / lint / build，其余为 'other'。时间列来自上方的单工具 turn 样本。",
    noBashCalls: '无 Bash 调用',
    colKind: '类型',
    colShare: '占比',
    bashBinaries: 'Bash — 二进制程序',
    bashBinariesDescription: (count: string) =>
      `当前分析快照中 ${count} 个不同的二进制程序，按调用次数排序。包含 shell 命令位置以及 runner 后引用的白名单验证工具（例如 uv run pytest）。时间列来自归属于命令首个二进制程序的单工具 turn 样本。`,
    bashTopBinariesAriaLabel: 'Bash 常用二进制程序',
    colBinary: '二进制程序',
    colInvocations: '调用次数',
    batchLabel: '（并行批次）',
    callsUnit: '次调用',
    allTools: '全部',
    sessionCount: (n: string) => ` · ${n} 个会话`,
    loadingToolAnalytics: '正在加载工具分析数据…',
    cacheTableMissing: '当前快照尚未构建工具分析数据',
    cacheTableMissingDetail:
      '待快照的 tool_analytics_cache 由快照维护程序重建后，工具分析数据将自动显示。',
    notAvailableInSnapshot: '当前快照中无工具分析数据',
    notAvailableDetail: '冻结快照中没有该视图的预计算工具分析数据。',
    reloadToolAnalyticsAriaLabel: '重新加载工具分析',
    failedToLoad: '加载工具分析数据失败',
    retry: '重试',
    stats: '统计',
    totalToolCalls: '总工具调用数',
    explicitToolErrorRate: '显式工具错误率',
    errorRateDetail: (errors: string, matched: string) =>
      `${errors} 个错误 / ${matched} 个 Anthropic 匹配结果`,
    verifiedEdited: '编辑后已验证',
    verifiedEditedDetail: (verified: string, edited: string) =>
      `${verified} / ${edited} 个已编辑会话`,
    finalVerifiedPass: '最终验证通过',
    finalVerifiedPassDetail: (n: string) => `${n} 个已编辑会话`,
    uniqueToolTypes: '工具类型数',
    sessionsAnalyzed: '已分析会话数',
    avgToolsPerSession: '平均每会话工具数',
    recoveredFailures: '失败后恢复',
    recoveredFailuresDetail: (recovered: string, total: string) =>
      `${recovered} 个已恢复 / ${total} 个含最终失败信号的会话`,
    distribution: '分布',
    toolUsageDistribution: '工具使用分布',
    topTransitions: '高频转换',
    transitionMatrix: '转换矩阵',
    rowNormalizedProbability: '行归一化概率',
    rawCounts: '原始计数',
    showCounts: '显示计数',
    showProbability: '显示概率',
    transitionMatrixDescription: (count: number) =>
      `Cell (i, j) = 工具 i 之后调用了工具 j。按用量排前 ${count} 的工具。`,
    explicitToolErrorRates: '显式工具错误率',
    anthropicToolResults: 'Anthropic 工具结果',
    matchedResults: (n: string) => `${n} 个匹配结果`,
    anthropicToolResultsDescription:
      '显式错误率 = 错误数 / Anthropic 匹配工具结果数。OpenAI 和 Codex 被排除，因为其协议不携带相同的错误标志；未匹配的 Anthropic 调用保持 unknown 状态。',
    noToolResultData: '暂无工具结果数据',
    anthropicToolResultsAriaLabel: 'Anthropic 工具结果',
    colMatched: '已匹配',
    colSuccess: '成功',
    colErrors: '错误数',
    colUnknown: '未知',
    colErrorRate: '错误率',
    verificationLoopAnalysis: '验证循环分析',
    sessionOutcomeProxies: '会话结果代理指标',
    sessionOutcomeDescription:
      '会话结果为代理指标：pass/fail 指编辑后最后一条识别出的验证命令是否通过，并非任务正确性的最终判定。',
    verificationCommandClasses: '验证命令分类',
    noVerificationCommands: '未识别到验证命令',
    colAttempts: '尝试次数',
    colAfterEdit: '编辑后',
    colPass: '通过',
    colFail: '失败',
    colFailRate: '失败率',
    agenticLoopDepth: '智能体循环深度',
    toolCallsPerSession: '每会话工具调用数',
    uniqueToolsPerSession: '每会话独立工具数',
    toolDiversityRatio: '工具多样性比（unique / total）',
    axisToolCalls: '工具调用次数',
    axisUniqueTools: '独立工具数',
    axisRatio: '比率',
    noData: '暂无数据',
    binsClip: (bins: number, clipped: string) =>
      `${bins} bins${clipped ? ` · ${clipped} 个会话超出坐标轴（~p95 截断）` : ''}`,
    outcomeLabels: {
      verified_pass: '验证通过',
      fail_recovered: '失败后恢复',
      fail_unrecovered: '失败未恢复',
      edited_unverified: '已编辑未验证',
      ambiguous: '无法确定',
      no_edit: '无编辑',
    } as Record<OutcomeKey, string>,
    agentLabels: { all: '全部', claude: 'Claude Code', codex: 'Codex' } as Record<
      AgentFilter,
      string
    >,
    harnessFilterGroupLabel: 'Harness',
    loopSessions: (sessions: string, pct: string) => `${sessions} 个会话（${pct}%）`,
    loopCycles: (p50: number, max: number) => `p50 ${p50} · 最多 ${max} 轮`,
    harnessFilterLabels: {
      all: '全部 harness',
      'claude-code': 'Claude Code',
      codex: 'Codex',
      pi: 'Pi',
      omp: 'Oh My Pi',
      other: '其他',
    } as Record<HarnessFilter, string>,
    sessionSample: (
      sessions: string,
      totalSessions: string,
      requests: string,
      totalRequests: string,
    ) => `会话样本：${sessions} / ${totalSessions} 个会话，${requests} / ${totalRequests} 个请求`,
  },
};

const MATRIX_ROW_LABEL_W = 120;
const MATRIX_COL_LABEL_H = 96;
const MATRIX_COLOR = CHART_COLORS[0];
const MATRIX_LEGEND_GAP = 4;

function matrixCellSize(width: number, count: number): number {
  if (count === 0) return 0;
  return Math.max(22, Math.min(44, Math.floor((width - MATRIX_ROW_LABEL_W) / count)));
}

function matrixOpacity(intensity: number): number {
  return 0.08 + intensity * 0.87;
}

function truncateLabel(label: string): string {
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

function formatProbability(p: number): string {
  const pct = p * 100;
  return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
}

interface MatrixHover {
  row: number;
  col: number;
  x: number;
  y: number;
}

function TransitionHeatmap({
  transitions,
  toolCount,
}: {
  transitions: { fromTool: string; toTool: string; count: number }[];
  toolCount: number;
}) {
  const t = STRINGS[useLocale()];
  const [hideSmall, setHideSmall] = useState(true);
  const [showProbability, setShowProbability] = useState(false);
  const [hover, setHover] = useState<MatrixHover | null>(null);
  const tools = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tr of transitions) {
      totals.set(tr.fromTool, (totals.get(tr.fromTool) || 0) + tr.count);
      totals.set(tr.toTool, (totals.get(tr.toTool) || 0) + tr.count);
    }
    return [...totals.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);
  }, [transitions]);
  const n = tools.length;
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({
    height: (width) => MATRIX_COL_LABEL_H + n * matrixCellSize(width, n) + MATRIX_LEGEND_GAP,
  });

  const { matrix, rowSums, maxVal } = useMemo(() => {
    const m: number[][] = Array.from({ length: tools.length }, () =>
      Array.from<number>({ length: tools.length }).fill(0),
    );
    const idx = new Map(tools.map((tool, i) => [tool, i]));
    for (const tr of transitions) {
      const fi = idx.get(tr.fromTool);
      const ti = idx.get(tr.toTool);
      if (fi !== undefined && ti !== undefined) m[fi][ti] = tr.count;
    }
    const rs = m.map((row) => row.reduce((a, b) => a + b, 0));
    let mx = 0;
    for (const row of m) for (const v of row) if (v > mx && (!hideSmall || v >= 5)) mx = v;
    return { matrix: m, rowSums: rs, maxVal: mx };
  }, [transitions, tools, hideSmall]);

  const probability = (row: number, col: number) =>
    rowSums[row] > 0 ? matrix[row][col] / rowSums[row] : 0;

  const cellIntensity = (row: number, col: number): number => {
    const raw = matrix[row][col];
    if (raw === 0) return 0;
    if (showProbability) return probability(row, col);
    return maxVal > 0 ? Math.min(1, Math.log1p(raw) / Math.log1p(maxVal)) : 0;
  };

  const cellLabel = (row: number, col: number): string => {
    const raw = matrix[row][col];
    if (raw === 0) return '';
    if (showProbability) return formatProbability(probability(row, col));
    return formatAxisNumber(raw);
  };

  const cell = matrixCellSize(dimensions.width, n);
  const gridBottom = MATRIX_COL_LABEL_H + n * cell;

  return (
    <ExpandableChart
      title={t.transitionMatrix}
      subtitle={`${showProbability ? t.rowNormalizedProbability : t.rawCounts} · ${t.transitionMatrixDescription(Math.min(15, toolCount))}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              track('agentic_workload_transition_mode_toggled', {
                show_probability: !showProbability,
              });
              setShowProbability((v) => !v);
            }}
          >
            {showProbability ? t.showCounts : t.showProbability}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-pressed={hideSmall}
            onClick={() => {
              track('agentic_workload_transition_hide_small_toggled', { enabled: !hideSmall });
              setHideSmall((h) => !h);
            }}
          >
            {t.hideSmall}
          </Button>
          <ChartActions
            fileName="tool-transition-matrix"
            onExportPng={() =>
              track('agentic_workload_export_png', { chart: 'tool-transition-matrix' })
            }
          />
        </div>
      }
    >
      {n === 0 ? (
        <EmptyState bare className="py-8">
          {t.noTransitionData}
        </EmptyState>
      ) : (
        <>
          <div ref={setContainerRef} className="w-full min-w-0 overflow-x-auto">
            {dimensions.width > 0 && (
              <svg
                width={MATRIX_ROW_LABEL_W + n * cell}
                height={gridBottom + MATRIX_LEGEND_GAP}
                role="img"
                aria-label={t.transitionMatrix}
                fontFamily={CHART_FONT_SANS}
                className="block"
                onMouseLeave={() => setHover(null)}
              >
                {tools.map((tool, j) => {
                  const cx = MATRIX_ROW_LABEL_W + j * cell + cell / 2;
                  return (
                    <text
                      key={`col-${tool}`}
                      x={cx}
                      y={MATRIX_COL_LABEL_H - 6}
                      dominantBaseline="central"
                      transform={`rotate(-90, ${cx}, ${MATRIX_COL_LABEL_H - 6})`}
                      fontSize={px(CHART_TYPE.annotation)}
                      className="fill-muted-foreground"
                    >
                      {truncateLabel(tool)}
                    </text>
                  );
                })}
                {tools.map((tool, i) => (
                  <text
                    key={`row-${tool}`}
                    x={MATRIX_ROW_LABEL_W - 8}
                    y={MATRIX_COL_LABEL_H + i * cell + cell / 2}
                    dominantBaseline="central"
                    textAnchor="end"
                    fontSize={px(CHART_TYPE.annotation)}
                    className="fill-muted-foreground"
                  >
                    {truncateLabel(tool)}
                  </text>
                ))}
                {tools.map((_fromTool, i) =>
                  tools.map((_toTool, j) => {
                    const raw = matrix[i][j];
                    const hidden = hideSmall && raw < 5;
                    const intensity = hidden ? 0 : cellIntensity(i, j);
                    const x = MATRIX_ROW_LABEL_W + j * cell;
                    const y = MATRIX_COL_LABEL_H + i * cell;
                    const isHovered = hover?.row === i && hover.col === j;
                    return (
                      <g
                        key={`${i}-${j}`}
                        onMouseMove={(e) =>
                          setHover({ row: i, col: j, x: e.clientX, y: e.clientY })
                        }
                      >
                        <rect
                          x={x + 0.5}
                          y={y + 0.5}
                          width={cell - 1}
                          height={cell - 1}
                          fill={raw === 0 || hidden ? 'var(--muted)' : MATRIX_COLOR}
                          fillOpacity={raw === 0 || hidden ? 0.4 : matrixOpacity(intensity)}
                          stroke={isHovered ? 'var(--foreground)' : 'none'}
                          strokeWidth={1.5}
                        />
                        {raw > 0 && !hidden && cell >= 28 && (
                          <text
                            x={x + cell / 2}
                            y={y + cell / 2}
                            dominantBaseline="central"
                            textAnchor="middle"
                            fontSize={px(CHART_TYPE.micro)}
                            className="tabular-nums"
                            fill={intensity > 0.55 ? 'var(--background)' : 'var(--foreground)'}
                            pointerEvents="none"
                          >
                            {cellLabel(i, j)}
                          </text>
                        )}
                      </g>
                    );
                  }),
                )}
              </svg>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">
              {showProbability ? t.matrixScaleProbability : t.matrixScaleCount}
            </span>
            <span className="tabular-nums">{showProbability ? '0%' : '1'}</span>
            <span
              aria-hidden="true"
              className="h-2.5 w-32 rounded-sm"
              style={{
                backgroundImage: `linear-gradient(to right, color-mix(in oklab, ${MATRIX_COLOR} 8%, transparent), ${MATRIX_COLOR})`,
              }}
            />
            <span className="tabular-nums">
              {showProbability ? '100%' : maxVal.toLocaleString()}
            </span>
            {!showProbability && <span>{t.logScale}</span>}
          </div>
          {hover && (
            <FloatingTooltip x={hover.x} y={hover.y}>
              <ChartHoverCardBody
                title={`${tools[hover.row]} → ${tools[hover.col]}`}
                metrics={[
                  {
                    value: matrix[hover.row][hover.col].toLocaleString(),
                    label: t.transitionsUnit,
                  },
                  {
                    value: formatProbability(probability(hover.row, hover.col)),
                    label: t.ofRowTransitions,
                  },
                ]}
                summary={
                  hideSmall && matrix[hover.row][hover.col] < 5 ? t.hiddenUnderFive : undefined
                }
              />
            </FloatingTooltip>
          )}
        </>
      )}
    </ExpandableChart>
  );
}

interface SequenceMotif {
  pattern: string[];
  support: number;
  supportRatio: number;
  avgRuns: number[];
}

interface ToolStreakStat {
  tool: string;
  totalCalls: number;
  runs: number;
  p50Run: number;
  p90Run: number;
  maxRun: number;
  streakSessions: number;
}

interface PingPongLoop {
  pair: [string, string];
  loops: number;
  sessions: number;
  supportRatio: number;
  p50Cycles: number;
  maxCycles: number;
}

interface SequenceInsightsPayload {
  totalSessions: number;
  totalCalls: number;
  collapsedSteps: number;
  repeatShare: number;
  longestStreak: { tool: string; run: number } | null;
  motifs: SequenceMotif[];
  streaks: ToolStreakStat[];
  loops: PingPongLoop[];
  warming?: boolean;
  setupRequired?: boolean;
}

function ToolChip({ tool, avgRun }: { tool: string; avgRun?: number }) {
  const showRun = avgRun !== undefined && avgRun >= 1.15;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-px text-xs font-medium text-foreground">
      {tool}
      {showRun && <span className="tabular-nums text-muted-foreground">×{avgRun.toFixed(1)}</span>}
    </span>
  );
}

function WorkflowPatterns({ harness }: { harness: HarnessFilter }) {
  const t = STRINGS[useLocale()];
  const { data, loading, error, reload } = useDashboardData<SequenceInsightsPayload>({
    key: harness,
    fetcher: async (signal) => {
      const response = await fetch(
        `/api/v1/agentic-workload-explorer/tool-analytics/sequences${harnessQuery(harness)}`,
        {
          signal,
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!body || typeof body !== 'object' || !('motifs' in body) || !Array.isArray(body.motifs)) {
        throw new Error('Unexpected workflow patterns response');
      }
      return body as SequenceInsightsPayload;
    },
  });

  if (loading) {
    return (
      <section>
        <SectionHeader label={t.workflowPatterns} />
        <Skeleton className="h-40 w-full rounded-xl" />
      </section>
    );
  }

  if (data?.setupRequired) {
    return (
      <section>
        <SectionHeader label={t.workflowPatterns} />
        <EmptyState>{t.workflowCacheMissing}</EmptyState>
      </section>
    );
  }

  if (!data || data.motifs.length === 0) {
    const canRetry = Boolean(data?.warming || error);
    return (
      <section>
        <SectionHeader label={t.workflowPatterns} />
        <EmptyState
          aria-live="polite"
          action={
            canRetry ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  track('agentic_workload_workflow_patterns_reload');
                  reload();
                }}
                aria-label={t.reloadWorkflowAriaLabel}
              >
                {t.reload}
              </Button>
            ) : undefined
          }
        >
          {data?.warming
            ? t.workflowNotAvailable
            : error
              ? t.workflowFetchError(error.message)
              : t.workflowNotEnough}
        </EmptyState>
      </section>
    );
  }

  const { streaks, loops } = data;
  const motifs = data.motifs.slice(0, 10);
  const maxSupport = motifs[0]?.support ?? 1;

  return (
    <section>
      <SectionHeader label={t.workflowPatterns} detail={motifs.length} />

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {[
          {
            label: t.repeatShare,
            value: formatPct(data.repeatShare),
            detail: t.repeatShareDetail,
          },
          {
            label: t.longestStreak,
            value: data.longestStreak
              ? `${data.longestStreak.tool} ×${data.longestStreak.run.toLocaleString()}`
              : '—',
            detail: t.longestStreakDetail,
          },
          {
            label: t.sessionsMined,
            value: data.totalSessions.toLocaleString(),
            detail: t.sessionsMinedDetail(
              data.totalCalls.toLocaleString(),
              data.collapsedSteps.toLocaleString(),
            ),
          },
        ].map((stat) => (
          <Stat
            key={stat.label}
            boxed
            label={stat.label}
            value={stat.value}
            detail={stat.detail}
            valueClassName="whitespace-normal"
          />
        ))}
      </dl>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{t.recurringMotifs}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t.motifsSubtitle(motifs.length, data.totalSessions.toLocaleString())} ·{' '}
            {t.motifsDescription}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {motifs.map((m, i) => {
              const pct = (m.supportRatio * 100).toFixed(1);
              const barPct = (m.support / maxSupport) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 text-right text-xs tabular-nums text-muted-foreground shrink-0">
                    #{i + 1}
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                    {m.pattern.map((tool, ti) => (
                      <span key={ti} className="flex items-center gap-0.5">
                        {ti > 0 && (
                          <span className="text-xs text-muted-foreground mx-0.5">&rarr;</span>
                        )}
                        <ToolChip tool={tool} avgRun={m.avgRuns[ti]} />
                      </span>
                    ))}
                  </div>
                  <div className="w-24 sm:w-48 shrink-0">
                    <div className="h-4 bg-muted/40 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-muted-foreground/40 rounded-sm"
                        style={{ width: `${Math.max(barPct, 3)}%` }}
                      />
                    </div>
                  </div>
                  <div className="min-w-20 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                    {m.support.toLocaleString()} ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t.toolStreaks}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t.toolStreaksDescription}</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted-foreground border-b border-border/20">
                  <tr>
                    <th className="text-left py-1.5 font-medium">{t.colTool}</th>
                    <th className="text-right py-1.5 font-medium">{t.colCalls}</th>
                    <th className="text-right py-1.5 font-medium">{t.colRuns}</th>
                    <th className="text-right py-1.5 font-medium">p50</th>
                    <th className="text-right py-1.5 font-medium">p90</th>
                    <th className="text-right py-1.5 font-medium">Max</th>
                    <th className="text-right py-1.5 font-medium">{t.colSessions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {streaks.map((row) => (
                    <tr key={row.tool}>
                      <td className="py-1.5 font-medium text-foreground">{row.tool}</td>
                      <td className="py-1.5 text-right">{row.totalCalls.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{row.runs.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{row.p50Run}</td>
                      <td className="py-1.5 text-right">{row.p90Run}</td>
                      <td className="py-1.5 text-right">{row.maxRun.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {row.streakSessions.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t.pingPongLoops}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t.pingPongDescription}</p>
          </CardHeader>
          <CardContent>
            {loops.length === 0 ? (
              <EmptyState bare className="py-6">
                {t.noRecurringLoops}
              </EmptyState>
            ) : (
              <div className="space-y-1.5">
                {loops.map((loop) => {
                  const pct = (loop.supportRatio * 100).toFixed(1);
                  return (
                    <div
                      key={loop.pair.join('→')}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:flex-nowrap"
                    >
                      <div className="flex items-center gap-1 w-[190px] shrink-0">
                        <ToolChip tool={loop.pair[0]} />
                        <span className="text-xs text-muted-foreground">&harr;</span>
                        <ToolChip tool={loop.pair[1]} />
                      </div>
                      <span className="hidden flex-1 sm:block" />
                      <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                        {t.loopSessions(loop.sessions.toLocaleString(), pct)}
                      </span>
                      <span className="min-w-24 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {t.loopCycles(loop.p50Cycles, loop.maxCycles)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

const TIMING_BIN_LABELS = [
  '<0.5s',
  '0.5–1s',
  '1–2s',
  '2–5s',
  '5–10s',
  '10–30s',
  '30–60s',
  '1–2m',
  '2–5m',
  '5–30m',
];

function formatMs(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const ms = Number(v);
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const BATCH_LABEL = '(parallel batch)';

const OS_ORDER = ['MacOS', 'Windows', 'Linux'];
const ARCH_ORDER = ['x64', 'arm64'];
const PLATFORM_COLORS: Record<string, string> = {
  MacOS: '#0ea5e9',
  Windows: '#8b5cf6',
  Linux: '#f59e0b',
  'MacOS/arm64': '#0ea5e9',
  'Windows/x64': '#8b5cf6',
  'Windows/arm64': '#f43f5e',
  'Linux/x64': '#f59e0b',
  'Linux/arm64': '#10b981',
};

function platformColor(key: string): string {
  return PLATFORM_COLORS[key] ?? '#6b7280';
}

const TOOL_AGENT: Record<string, Exclude<AgentFilter, 'all'>> = {
  Bash: 'claude',
  Read: 'claude',
  Edit: 'claude',
  Write: 'claude',
  Grep: 'claude',
  Glob: 'claude',
  TaskCreate: 'claude',
  TaskUpdate: 'claude',
  WebFetch: 'claude',
  WebSearch: 'claude',
  Agent: 'claude',
  PowerShell: 'claude',
  exec_command: 'codex',
  shell_command: 'codex',
  write_stdin: 'codex',
  custom_tool_call: 'codex',
  apply_patch: 'codex',
  update_plan: 'codex',
  wait: 'codex',
  js: 'codex',
  web_search_call: 'codex',
};

const ALL_TOOL = 'All';
const ALL_AGG_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'TaskUpdate', 'Grep'];

const FINE_BINS_PER_DECADE = 8;
const FINE_BIN_MIN = 12;
const FINE_BIN_MAX = 42;

function fineBinMs(bin: number): number {
  return 10 ** (bin / FINE_BINS_PER_DECADE);
}

function p50FromBins(bins: Map<number, number>): number | null {
  let total = 0;
  for (const c of bins.values()) total += c;
  if (total === 0) return null;
  const target = total / 2;
  let cum = 0;
  for (const bin of [...bins.keys()].toSorted((a, b) => a - b)) {
    const c = bins.get(bin) ?? 0;
    if (cum + c >= target) return fineBinMs(bin + (target - cum) / c);
    cum += c;
  }
  return null;
}

function OsTurnaroundCards({ byOs }: { byOs: ToolTimings['byOs'] }) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const tools = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of byOs.perTool) {
      totals.set(row.toolName, (totals.get(row.toolName) ?? 0) + Number(row.samples));
    }
    return [...totals.entries()].toSorted((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [byOs.perTool]);

  const [selected, setSelected] = useState<string | null>(null);
  const [splitArch, setSplitArch] = useState(false);
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');

  const availableAgents = useMemo(() => {
    const present = new Set(tools.map((name) => TOOL_AGENT[name]).filter(Boolean));
    return AGENT_FILTERS.filter((a) => a === 'all' || present.has(a));
  }, [tools]);

  const filteredTools = useMemo(
    () =>
      agentFilter === 'all' ? tools : tools.filter((name) => TOOL_AGENT[name] === agentFilter),
    [tools, agentFilter],
  );

  const aggTools = useMemo(
    () => ALL_AGG_TOOLS.filter((name) => filteredTools.includes(name)),
    [filteredTools],
  );
  const selectableTools = aggTools.length > 0 ? [ALL_TOOL, ...filteredTools] : filteredTools;

  const activeTool =
    selected && selectableTools.includes(selected)
      ? selected
      : filteredTools.includes('Bash')
        ? 'Bash'
        : filteredTools[0];
  const isAll = activeTool === ALL_TOOL;

  const platforms = useMemo(() => {
    if (!splitArch) {
      return byOs.perTool
        .filter((r) => r.toolName === activeTool)
        .toSorted((a, b) => OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os))
        .map((stat) => ({ key: stat.os, os: stat.os, arch: null as string | null, stat }));
    }
    return byOs.perPlatform
      .filter((r) => r.toolName === activeTool)
      .toSorted(
        (a, b) =>
          OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os) ||
          ARCH_ORDER.indexOf(a.arch) - ARCH_ORDER.indexOf(b.arch),
      )
      .map((stat) => ({
        key: `${stat.os}/${stat.arch}`,
        os: stat.os,
        arch: stat.arch as string | null,
        stat,
      }));
  }, [byOs, activeTool, splitArch]);

  const series = useMemo(() => {
    if (isAll) {
      const groups = new Map<
        string,
        { os: string; arch: string | null; bins: Map<number, number> }
      >();
      for (const row of byOs.fineHistogram) {
        if (!aggTools.includes(row.toolName)) continue;
        const key = splitArch ? `${row.os}/${row.arch}` : row.os;
        let g = groups.get(key);
        if (!g) {
          g = { os: row.os, arch: splitArch ? row.arch : null, bins: new Map() };
          groups.set(key, g);
        }
        g.bins.set(Number(row.bin), (g.bins.get(Number(row.bin)) ?? 0) + Number(row.count));
      }
      return [...groups.entries()]
        .toSorted(
          ([, a], [, b]) =>
            OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os) ||
            ARCH_ORDER.indexOf(a.arch ?? '') - ARCH_ORDER.indexOf(b.arch ?? ''),
        )
        .map(([key, g]) => {
          let total = 0;
          for (const count of g.bins.values()) total += count;
          return {
            key,
            bins: g.bins,
            total,
            p50Ms: p50FromBins(g.bins),
            sessions: null as number | null,
          };
        });
    }
    return platforms.map(({ key, os, arch, stat }) => {
      const bins = new Map<number, number>();
      for (const row of byOs.fineHistogram) {
        if (row.toolName !== activeTool || row.os !== os) continue;
        if (arch !== null && row.arch !== arch) continue;
        bins.set(Number(row.bin), (bins.get(Number(row.bin)) ?? 0) + Number(row.count));
      }
      let total = 0;
      for (const count of bins.values()) total += count;
      return {
        key,
        bins,
        total,
        p50Ms: (stat?.p50Ms ?? null) as number | null,
        sessions: (stat ? Number(stat.sessions) : null) as number | null,
      };
    });
  }, [isAll, aggTools, platforms, byOs.fineHistogram, activeTool, splitArch]);

  const tableColumns = useMemo(() => {
    if (!splitArch) return OS_ORDER.map((os) => ({ key: os, os, arch: null as string | null }));
    const seen = new Map<string, { key: string; os: string; arch: string | null }>();
    for (const r of byOs.perPlatform) {
      const key = `${r.os}/${r.arch}`;
      if (!seen.has(key)) seen.set(key, { key, os: r.os, arch: r.arch });
    }
    return [...seen.values()].toSorted(
      (a, b) =>
        OS_ORDER.indexOf(a.os) - OS_ORDER.indexOf(b.os) ||
        ARCH_ORDER.indexOf(a.arch ?? '') - ARCH_ORDER.indexOf(b.arch ?? ''),
    );
  }, [byOs.perPlatform, splitArch]);

  const statFor = (col: { os: string; arch: string | null }, tool: string) =>
    col.arch === null
      ? byOs.perTool.find((r) => r.os === col.os && r.toolName === tool)
      : byOs.perPlatform.find((r) => r.os === col.os && r.arch === col.arch && r.toolName === tool);

  if (tools.length === 0) return null;

  let lo = FINE_BIN_MAX;
  let hi = FINE_BIN_MIN;
  for (const s of series) {
    for (const bin of s.bins.keys()) {
      if (bin < lo) lo = bin;
      if (bin > hi) hi = bin;
    }
  }
  lo = Math.max(lo, FINE_BIN_MIN);
  hi = Math.min(Math.max(hi, lo + 1), FINE_BIN_MAX);
  if (lo >= hi) lo = Math.max(hi - 1, 0);

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ExpandableChart
        title={t.toolTurnaroundTitle(activeTool === ALL_TOOL ? t.allTools : activeTool, splitArch)}
        subtitle={t.turnaroundShapeDescription}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-pressed={splitArch}
              onClick={() => {
                track('agentic_workload_turnaround_split_arch_toggled', {
                  enabled: !splitArch,
                });
                setSplitArch((v) => !v);
              }}
            >
              {t.splitByArch}
            </Button>
            <ChartActions
              fileName={`turnaround-by-os-${activeTool.toLowerCase()}`}
              onExportPng={() =>
                track('agentic_workload_export_png', { chart: 'tool-turnaround-by-os' })
              }
            />
          </div>
        }
      >
        <div className="mb-3 space-y-1">
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-12 shrink-0 items-center text-xs font-medium text-muted-foreground">
              {t.agent}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {availableAgents.map((agent) => (
                <Button
                  key={agent}
                  type="button"
                  variant="outline"
                  size="2xs"
                  aria-pressed={agent === agentFilter}
                  onClick={() => {
                    track('agentic_workload_turnaround_agent_filter_changed', { agent });
                    setAgentFilter(agent);
                  }}
                >
                  {t.agentLabels[agent]}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-12 shrink-0 items-center text-xs font-medium text-muted-foreground">
              {t.tool}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {selectableTools.map((tool) => (
                <Button
                  key={tool}
                  type="button"
                  variant="outline"
                  size="2xs"
                  aria-pressed={tool === activeTool}
                  onClick={() => {
                    track('agentic_workload_turnaround_tool_selected', { tool });
                    setSelected(tool);
                  }}
                >
                  {tool === ALL_TOOL ? t.allTools : tool}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <TurnaroundShapeChart series={series} lo={lo} hi={hi} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {series.map(({ key, total, p50Ms, sessions }) => (
            <span key={key} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: platformColor(key) }}
              />
              <span className="text-foreground">{key}</span>
              <span className="tabular-nums text-muted-foreground">
                n={total.toLocaleString()}
                {sessions !== null && t.sessionCount(sessions.toLocaleString())}
                {p50Ms !== null && ` · p50 ${formatMs(p50Ms)}`}
              </span>
            </span>
          ))}
        </div>
      </ExpandableChart>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{t.medianTurnaroundByOs(splitArch)}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t.medianTurnaroundDescription(splitArch)}
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground border-b border-border/20">
                <tr>
                  <th className="text-left py-1.5 font-medium">{t.colTool}</th>
                  {tableColumns.map((col) => (
                    <th key={col.key} className="text-right py-1.5 font-medium">
                      <span
                        aria-hidden="true"
                        className="mr-1.5 inline-block size-2 rounded-sm"
                        style={{ backgroundColor: platformColor(col.key) }}
                      />
                      {col.arch ? `${col.os} ${col.arch}` : col.os}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredTools.map((tool) => (
                  <tr key={tool}>
                    <td className="py-1.5 font-medium text-foreground">{tool}</td>
                    {tableColumns.map((col) => {
                      const stat = statFor(col, tool);
                      return (
                        <td key={col.key} className="py-1.5 text-right align-top">
                          {stat ? (
                            <>
                              <div>{formatMs(stat.p50Ms)}</div>
                              <div className="text-2xs text-muted-foreground">
                                p90 {formatMs(stat.p90Ms)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ShapeSeries {
  key: string;
  bins: Map<number, number>;
  total: number;
  p50Ms: number | null;
}

const SHAPE_MARGIN = { top: 12, right: 12, bottom: 40, left: 44 };
const SHAPE_HEIGHT = 240;
const SHAPE_Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

function TurnaroundShapeChart({
  series,
  lo,
  hi,
}: {
  series: ShapeSeries[];
  lo: number;
  hi: number;
}) {
  const t = STRINGS[useLocale()];
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: SHAPE_HEIGHT });
  const [hover, setHover] = useState<{ bin: number; x: number; y: number } | null>(null);

  const visible = series.filter((s) => s.total > 0);
  let yMax = 0;
  for (const s of visible) {
    for (const [bin, count] of s.bins) {
      if (bin >= lo && bin <= hi) yMax = Math.max(yMax, count / s.total);
    }
  }
  if (yMax === 0) yMax = 1;

  const plotW = Math.max(0, dimensions.width - SHAPE_MARGIN.left - SHAPE_MARGIN.right);
  const plotH = SHAPE_HEIGHT - SHAPE_MARGIN.top - SHAPE_MARGIN.bottom;
  const baseline = SHAPE_MARGIN.top + plotH;
  const sx = (bin: number) => SHAPE_MARGIN.left + ((bin - lo) / (hi - lo + 1)) * plotW;
  const sy = (share: number) => baseline - (share / yMax) * plotH;

  const decadeTicks: number[] = [];
  for (
    let bin = Math.ceil(lo / FINE_BINS_PER_DECADE) * FINE_BINS_PER_DECADE;
    bin <= hi;
    bin += FINE_BINS_PER_DECADE
  ) {
    decadeTicks.push(bin);
  }

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const bin = Math.min(hi, Math.max(lo, Math.floor(lo + rel * (hi - lo + 1))));
    setHover({ bin, x: e.clientX, y: e.clientY });
  };

  return (
    <div ref={setContainerRef} className="w-full min-w-0">
      {dimensions.width > 0 && (
        <svg
          width={dimensions.width}
          height={SHAPE_HEIGHT}
          role="img"
          aria-label={`${t.turnaroundShapeByOs}, ${t.turnaroundAxisLabel}`}
          fontFamily={CHART_FONT_SANS}
          className="block"
        >
          {SHAPE_Y_TICKS.map((f) => (
            <g key={f}>
              <line
                x1={SHAPE_MARGIN.left}
                x2={SHAPE_MARGIN.left + plotW}
                y1={sy(f * yMax)}
                y2={sy(f * yMax)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={SHAPE_MARGIN.left - 6}
                y={sy(f * yMax)}
                dominantBaseline="central"
                textAnchor="end"
                fontSize={px(CHART_TYPE.annotation)}
                className="fill-muted-foreground tabular-nums"
              >
                {`${(f * yMax * 100).toFixed(yMax < 0.1 ? 1 : 0)}%`}
              </text>
            </g>
          ))}
          {decadeTicks.map((bin) => (
            <text
              key={bin}
              x={sx(bin)}
              y={baseline + 16}
              textAnchor="middle"
              fontSize={px(CHART_TYPE.annotation)}
              className="fill-muted-foreground tabular-nums"
            >
              {formatMs(fineBinMs(bin))}
            </text>
          ))}
          <text
            x={SHAPE_MARGIN.left + plotW / 2}
            y={SHAPE_HEIGHT - 4}
            textAnchor="middle"
            fontSize={px(CHART_TYPE.axisLabel)}
            className="fill-muted-foreground"
          >
            {t.turnaroundAxisLabel}
          </text>
          {visible.map(({ key, bins, total, p50Ms }) => {
            const color = platformColor(key);
            const points: string[] = [];
            for (let bin = lo; bin <= hi; bin++) {
              points.push(
                `${sx(bin + 0.5).toFixed(1)},${sy((bins.get(bin) ?? 0) / total).toFixed(1)}`,
              );
            }
            const area = `M ${sx(lo + 0.5).toFixed(1)} ${baseline} L ${points.join(' L ')} L ${sx(hi + 0.5).toFixed(1)} ${baseline} Z`;
            const p50Bin =
              p50Ms === null ? null : Math.log10(Math.max(Number(p50Ms), 1)) * FINE_BINS_PER_DECADE;
            return (
              <g key={key} pointerEvents="none">
                <path d={area} fill={color} fillOpacity={0.1} />
                <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
                {p50Bin !== null && p50Bin >= lo && p50Bin <= hi && (
                  <line
                    x1={sx(p50Bin)}
                    y1={SHAPE_MARGIN.top}
                    x2={sx(p50Bin)}
                    y2={baseline}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    opacity={0.6}
                  />
                )}
              </g>
            );
          })}
          {hover && (
            <g pointerEvents="none">
              <line
                x1={sx(hover.bin + 0.5)}
                x2={sx(hover.bin + 0.5)}
                y1={SHAPE_MARGIN.top}
                y2={baseline}
                {...CURSOR_LINE_PROPS}
              />
              {visible.map(({ key, bins, total }) => (
                <circle
                  key={key}
                  cx={sx(hover.bin + 0.5)}
                  cy={sy((bins.get(hover.bin) ?? 0) / total)}
                  r={3}
                  fill={platformColor(key)}
                />
              ))}
            </g>
          )}
          <rect
            x={SHAPE_MARGIN.left}
            y={SHAPE_MARGIN.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover && (
        <FloatingTooltip x={hover.x} y={hover.y}>
          <ChartHoverCardBody
            title={`${formatMs(fineBinMs(hover.bin))} – ${formatMs(fineBinMs(hover.bin + 1))}`}
            metrics={visible.map(({ key, bins, total }) => ({
              value: `${(((bins.get(hover.bin) ?? 0) / total) * 100).toFixed(1)}%`,
              label: key,
              color: platformColor(key),
            }))}
            summary={t.shareOfSamples}
          />
        </FloatingTooltip>
      )}
    </div>
  );
}

function ToolTimingSection({ timings }: { timings: ToolTimings }) {
  const t = STRINGS[useLocale()];
  const { perTool, coverage } = timings;
  const selectable = useMemo(
    () =>
      perTool
        .filter((row) => row.toolName !== BATCH_LABEL)
        .slice(0, 8)
        .map((row) => row.toolName),
    [perTool],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const activeTool =
    selected && selectable.includes(selected)
      ? selected
      : selectable.includes('Bash')
        ? 'Bash'
        : (selectable[0] ?? null);

  const bins = useMemo(() => {
    const counts = Array.from({ length: TIMING_BIN_LABELS.length }, () => 0);
    if (!activeTool) return counts;
    for (const row of timings.histogram) {
      if (row.toolName === activeTool && row.bin >= 0 && row.bin < counts.length) {
        counts[row.bin] = Number(row.count);
      }
    }
    return counts;
  }, [timings.histogram, activeTool]);
  const maxBin = Math.max(...bins, 1);
  const binTotal = bins.reduce((a, b) => a + b, 0);

  const bashRows = useMemo(() => {
    const timing = new Map(timings.bashByKind.map((r) => [r.kind, r]));
    return timings.bashKindCounts.map(({ kind, count }) => ({
      kind,
      count: Number(count),
      timing: timing.get(kind) ?? null,
    }));
  }, [timings]);
  const bashTotal = bashRows.reduce((s, r) => s + r.count, 0);

  const binaryRows = useMemo(() => {
    const timing = new Map(timings.bashByBinary.map((r) => [r.binary, r]));
    return timings.bashBinaryCounts.map(({ binary, count }) => ({
      binary,
      count: Number(count),
      timing: timing.get(binary) ?? null,
    }));
  }, [timings]);
  const binaryTotal = Number(timings.bashBinaryTotal);

  if (perTool.length === 0) return null;

  const sampledPct =
    coverage.toolTurns > 0 ? (coverage.singleToolTurns / coverage.toolTurns) * 100 : 0;

  return (
    <section>
      <SectionHeader label={t.toolWallTime} detail={t.toolCountDetail(perTool.length)} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t.turnaroundByTool}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.clientSideWallTime} ·{' '}
              {t.turnaroundByToolDescription(
                coverage.singleToolTurns.toLocaleString(),
                coverage.toolTurns.toLocaleString(),
                sampledPct.toFixed(0),
                t.batchLabel,
              )}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted-foreground border-b border-border/20">
                  <tr>
                    <th className="text-left py-1.5 font-medium">{t.colTool}</th>
                    <th className="text-right py-1.5 font-medium">{t.colSamples}</th>
                    <th className="text-right py-1.5 font-medium">p50</th>
                    <th className="text-right py-1.5 font-medium">p90</th>
                    <th className="text-right py-1.5 font-medium">p99</th>
                    <th className="text-right py-1.5 font-medium">{t.colMean}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {perTool.slice(0, 14).map((row) => (
                    <tr key={row.toolName}>
                      <td
                        className={`py-1.5 font-medium ${row.toolName === BATCH_LABEL ? 'text-muted-foreground' : 'text-foreground'}`}
                      >
                        {row.toolName === BATCH_LABEL ? t.batchLabel : row.toolName}
                      </td>
                      <td className="py-1.5 text-right">{Number(row.samples).toLocaleString()}</td>
                      <td className="py-1.5 text-right">{formatMs(row.p50Ms)}</td>
                      <td className="py-1.5 text-right">{formatMs(row.p90Ms)}</td>
                      <td className="py-1.5 text-right">{formatMs(row.p99Ms)}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {formatMs(row.meanMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t.turnaroundDistribution}</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">N = {binTotal.toLocaleString()}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selectable.map((tool) => (
                <Button
                  key={tool}
                  type="button"
                  variant="outline"
                  size="2xs"
                  aria-pressed={tool === activeTool}
                  onClick={() => {
                    track('agentic_workload_timing_tool_selected', { tool });
                    setSelected(tool);
                  }}
                >
                  {tool}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {TIMING_BIN_LABELS.map((label, i) => {
                const count = bins[i];
                const pct = binTotal > 0 ? (count / binTotal) * 100 : 0;
                return (
                  <div
                    key={label}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:flex"
                  >
                    <span className="min-w-0 sm:w-14 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                      {label}
                    </span>
                    <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${(count / maxBin) * 100}%`,
                          minWidth: count > 0 ? 2 : 0,
                          backgroundColor: CHART_COLORS[0],
                        }}
                      />
                    </div>
                    <span className="sm:w-28 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                      {count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {timings.byOs && timings.byOs.perTool.length > 0 && <OsTurnaroundCards byOs={timings.byOs} />}

      <div className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t.bashBreakdown}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              N = {bashTotal.toLocaleString()} {t.callsUnit} · {t.bashBreakdownDescription}
            </p>
          </CardHeader>
          <CardContent>
            {bashRows.length === 0 ? (
              <EmptyState bare className="py-8">
                {t.noBashCalls}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-muted-foreground border-b border-border/20">
                    <tr>
                      <th className="text-left py-1.5 font-medium">{t.colKind}</th>
                      <th className="text-right py-1.5 font-medium">{t.colCalls}</th>
                      <th className="text-left py-1.5 font-medium pl-4 w-[30%]">{t.colShare}</th>
                      <th className="text-right py-1.5 font-medium">{t.colSamples}</th>
                      <th className="text-right py-1.5 font-medium">p50</th>
                      <th className="text-right py-1.5 font-medium">p90</th>
                      <th className="text-right py-1.5 font-medium">p99</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {bashRows.map((row) => {
                      const share = bashTotal > 0 ? (row.count / bashTotal) * 100 : 0;
                      return (
                        <tr key={row.kind}>
                          <td className="py-1.5 font-medium">{row.kind}</td>
                          <td className="py-1.5 text-right">{row.count.toLocaleString()}</td>
                          <td className="py-1.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/40">
                                <div
                                  className="h-full rounded-sm"
                                  style={{
                                    width: `${share}%`,
                                    minWidth: row.count > 0 ? 2 : 0,
                                    backgroundColor: CHART_COLORS[0],
                                  }}
                                />
                              </div>
                              <span className="min-w-12 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                                {share.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">
                            {row.timing ? Number(row.timing.samples).toLocaleString() : '—'}
                          </td>
                          <td className="py-1.5 text-right">{formatMs(row.timing?.p50Ms)}</td>
                          <td className="py-1.5 text-right">{formatMs(row.timing?.p90Ms)}</td>
                          <td className="py-1.5 text-right">{formatMs(row.timing?.p99Ms)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {binaryRows.length > 0 && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t.bashBinaries}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.invocationsCount(binaryTotal.toLocaleString())} ·{' '}
                {t.bashBinariesDescription(binaryRows.length.toLocaleString())}
              </p>
            </CardHeader>
            <CardContent>
              <div
                role="region"
                aria-label={t.bashTopBinariesAriaLabel}
                tabIndex={0}
                className="max-h-80 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
              >
                <table className="w-full text-xs tabular-nums">
                  <thead className="sticky top-0 z-10 bg-background text-muted-foreground border-b border-border/20">
                    <tr>
                      <th className="text-left py-1.5 font-medium">{t.colBinary}</th>
                      <th className="text-right py-1.5 font-medium">{t.colInvocations}</th>
                      <th className="text-left py-1.5 font-medium pl-4 w-[30%]">{t.colShare}</th>
                      <th className="text-right py-1.5 font-medium">{t.colSamples}</th>
                      <th className="text-right py-1.5 font-medium">p50</th>
                      <th className="text-right py-1.5 font-medium">p90</th>
                      <th className="text-right py-1.5 font-medium">p99</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {binaryRows.map((row) => {
                      const share = binaryTotal > 0 ? (row.count / binaryTotal) * 100 : 0;
                      return (
                        <tr key={row.binary}>
                          <td className="py-1.5 font-mono font-medium">{row.binary}</td>
                          <td className="py-1.5 text-right">{row.count.toLocaleString()}</td>
                          <td className="py-1.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/40">
                                <div
                                  className="h-full rounded-sm"
                                  style={{
                                    width: `${share}%`,
                                    minWidth: row.count > 0 ? 2 : 0,
                                    backgroundColor: CHART_COLORS[0],
                                  }}
                                />
                              </div>
                              <span className="min-w-12 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                                {share.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">
                            {row.timing ? Number(row.timing.samples).toLocaleString() : '—'}
                          </td>
                          <td className="py-1.5 text-right">{formatMs(row.timing?.p50Ms)}</td>
                          <td className="py-1.5 text-right">{formatMs(row.timing?.p90Ms)}</td>
                          <td className="py-1.5 text-right">{formatMs(row.timing?.p99Ms)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

const HISTOGRAM_PERCENTILES = [25, 50, 75, 90, 95, 99];

function formatRatio(v: number): string {
  return v.toFixed(2);
}

function SessionHistogram({
  id,
  title,
  values,
  axisLabel,
  format,
}: {
  id: string;
  title: string;
  values: number[];
  axisLabel: string;
  format: (v: number) => string;
}) {
  const t = STRINGS[useLocale()];
  const { buckets, percentiles, clipped } = useMemo(() => {
    const sorted = values.toSorted((a, b) => a - b);
    const bins = buildHistogram(values, 50);
    const at = (p: number) =>
      sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
    return {
      buckets: bins,
      percentiles: HISTOGRAM_PERCENTILES.map((p) => ({ label: `p${p}`, value: at(p) })),
      clipped: bins.length > 0 ? values.filter((v) => v > bins.at(-1)!.max).length : 0,
    };
  }, [values]);
  const fileName = `${id}-distribution`;

  if (values.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState bare className="h-40">
            {t.noData}
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <ExpandableChart
      title={title}
      subtitle={`N = ${values.length.toLocaleString()} · ${t.binsClip(buckets.length, clipped > 0 ? clipped.toLocaleString() : '')}`}
      actions={
        <ChartActions
          fileName={fileName}
          onExportPng={() => track('agentic_workload_export_png', { chart: fileName })}
        />
      }
    >
      {(expanded) => (
        <DistributionHistogram
          buckets={buckets}
          percentiles={percentiles}
          format={format}
          axisLabel={axisLabel}
          expanded={expanded}
          color={CHART_COLORS[0]}
          countLabel={{ one: t.sessionOne, other: t.sessionOther }}
        />
      )}
    </ExpandableChart>
  );
}

const HARNESS_FILTERS: { value: HarnessFilter }[] = [
  { value: 'all' },
  ...HARNESSES.map((h) => ({ value: h })),
];

function harnessQuery(harness: HarnessFilter): string {
  return harness === 'all' ? '' : `?harness=${harness}`;
}

export default function ToolAnalyticsPage() {
  return (
    <Suspense>
      <ToolAnalyticsPageContent />
    </Suspense>
  );
}

function ToolAnalyticsPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const explorerHref = useExplorerHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('harness');
  const harness: HarnessFilter = isHarness(raw) ? raw : 'all';
  const isMobile = useIsMobileViewport();

  function setHarness(value: HarnessFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete('harness');
    else params.set('harness', value);
    const qs = params.toString();
    router.replace(explorerHref(`/tool-analytics${qs ? `?${qs}` : ''}`), { scroll: false });
  }

  return (
    <div className="space-y-5">
      <SegmentedToggle
        role="group"
        variant={isMobile ? 'select' : 'segments'}
        ariaLabel={t.harnessFilterGroupLabel}
        value={harness}
        onValueChange={(value) => {
          track('agentic_workload_harness_filter_changed', { harness: value });
          setHarness(value);
        }}
        options={HARNESS_FILTERS.map((f) => ({
          value: f.value,
          label: t.harnessFilterLabels[f.value],
        }))}
      />
      <ToolAnalyticsView harness={harness} />
    </div>
  );
}

function ToolAnalyticsView({ harness }: { harness: HarnessFilter }) {
  const t = STRINGS[useLocale()];

  const {
    data: response,
    loading,
    error: loadError,
    reload,
  } = useDashboardData<ToolAnalyticsResponse>({
    key: harness,
    fetcher: async (signal) => {
      const r = await fetch(
        `/api/v1/agentic-workload-explorer/tool-analytics${harnessQuery(harness)}`,
        { signal },
      );
      const body: unknown = await r.json().catch(() => null);
      if (!r.ok) {
        const message =
          body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : `HTTP ${r.status}`;
        throw new Error(message);
      }
      if (isWarmingResponse(body) || isSetupRequiredResponse(body)) return body;
      if (!isToolAnalyticsData(body)) throw new Error('Unexpected tool analytics response');
      return body;
    },
  });
  const data =
    response && !isWarmingResponse(response) && !isSetupRequiredResponse(response)
      ? response
      : null;

  const totalToolCalls = useMemo(
    () => data?.toolCounts.reduce((s, tc) => s + Number(tc.count), 0) ?? 0,
    [data],
  );
  const totalTransitions = useMemo(
    () => data?.transitions.reduce((s, tr) => s + Number(tr.count), 0) ?? 0,
    [data],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground">{t.loadingToolAnalytics}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (response && isSetupRequiredResponse(response)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
        <div>{t.cacheTableMissing}</div>
        <div className="text-xs text-muted-foreground">{t.cacheTableMissingDetail}</div>
      </div>
    );
  }

  if (response && isWarmingResponse(response)) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <div>{t.notAvailableInSnapshot}</div>
        <div className="text-xs text-muted-foreground">{t.notAvailableDetail}</div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            track('agentic_workload_tool_analytics_reload');
            reload();
          }}
          aria-label={t.reloadToolAnalyticsAriaLabel}
        >
          {t.reload}
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div>
          {t.failedToLoad}
          {loadError ? `: ${loadError.message}` : ''}
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            track('agentic_workload_tool_analytics_retry');
            reload();
          }}
        >
          {t.retry}
        </Button>
      </div>
    );
  }

  const {
    toolCounts,
    transitions,
    sessionToolStats,
    toolErrorRates,
    toolErrorRatesByOs,
    verificationSummary,
    verificationByKind,
    sessionOutcomeCounts,
  } = data;
  const maxToolCount = Math.max(...toolCounts.map((tc) => Number(tc.count)), 1);
  const avgToolsPerSession =
    verificationSummary.sessionsAnalyzed > 0
      ? totalToolCalls / Number(verificationSummary.sessionsAnalyzed)
      : 0;

  const totalToolValues = sessionToolStats.map((s) => Number(s.totalTools));
  const uniqueToolValues = sessionToolStats.map((s) => Number(s.uniqueTools));
  const diversityValues = sessionToolStats
    .filter((s) => Number(s.totalTools) > 0)
    .map((s) => Number(s.uniqueTools) / Number(s.totalTools));

  const matchedToolResults = toolErrorRates.reduce((s, row) => s + Number(row.matchedResults), 0);
  const toolErrors = toolErrorRates.reduce((s, row) => s + Number(row.errors), 0);
  const overallToolErrorRate =
    matchedToolResults > 0 ? Number(toolErrors) / Number(matchedToolResults) : null;
  const editedSessions = Number(verificationSummary.editedSessions);
  const verifiedEditedSessions = Number(verificationSummary.verifiedEditedSessions);
  const verificationCoverage =
    editedSessions > 0 ? verifiedEditedSessions / Number(editedSessions) : null;
  const finalVerifiedPassSessions =
    Number(verificationSummary.verifiedPassSessions) +
    Number(verificationSummary.failRecoveredSessions);
  const finalVerifiedPassRate =
    editedSessions > 0 ? finalVerifiedPassSessions / Number(editedSessions) : null;
  const recoveryDenominator =
    Number(verificationSummary.failRecoveredSessions) +
    Number(verificationSummary.failUnrecoveredSessions);
  const recoveryRate =
    recoveryDenominator > 0
      ? Number(verificationSummary.failRecoveredSessions) / recoveryDenominator
      : null;

  return (
    <div className="space-y-5">
      {data.sample && (
        <div className="text-xs tabular-nums text-muted-foreground">
          {t.sessionSample(
            data.sample.sessions.toLocaleString(),
            data.sample.totalSessions.toLocaleString(),
            data.sample.requests.toLocaleString(),
            data.sample.totalRequests.toLocaleString(),
          )}
        </div>
      )}

      <section>
        <SectionHeader label={t.stats} />
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: t.totalToolCalls, value: totalToolCalls.toLocaleString() },
            {
              label: t.explicitToolErrorRate,
              value: formatPct(overallToolErrorRate),
              detail: t.errorRateDetail(
                toolErrors.toLocaleString(),
                matchedToolResults.toLocaleString(),
              ),
            },
            {
              label: t.verifiedEdited,
              value: formatPct(verificationCoverage),
              detail: t.verifiedEditedDetail(
                verifiedEditedSessions.toLocaleString(),
                editedSessions.toLocaleString(),
              ),
            },
            {
              label: t.finalVerifiedPass,
              value: formatPct(finalVerifiedPassRate),
              detail: t.finalVerifiedPassDetail(finalVerifiedPassSessions.toLocaleString()),
            },
            { label: t.uniqueToolTypes, value: String(toolCounts.length) },
            {
              label: t.sessionsAnalyzed,
              value: verificationSummary.sessionsAnalyzed.toLocaleString(),
            },
            { label: t.avgToolsPerSession, value: avgToolsPerSession.toFixed(1) },
            {
              label: t.recoveredFailures,
              value: formatPct(recoveryRate),
              detail: t.recoveredFailuresDetail(
                Number(verificationSummary.failRecoveredSessions).toLocaleString(),
                recoveryDenominator.toLocaleString(),
              ),
            },
          ].map((stat) => (
            <Stat
              key={stat.label}
              boxed
              label={stat.label}
              value={stat.value}
              detail={'detail' in stat ? stat.detail : undefined}
            />
          ))}
        </dl>
      </section>

      <section>
        <SectionHeader label={t.distribution} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t.toolUsageDistribution}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                N = {totalToolCalls.toLocaleString()}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {toolCounts.slice(0, 15).map((tc) => (
                  <div
                    key={tc.toolName}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex"
                  >
                    <span
                      className="min-w-0 sm:w-36 shrink-0 truncate text-xs text-foreground"
                      title={tc.toolName}
                    >
                      {tc.toolName}
                    </span>
                    <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${(Number(tc.count) / maxToolCount) * 100}%`,
                          minWidth: 2,
                          backgroundColor: CHART_COLORS[0],
                        }}
                      />
                    </div>
                    <span className="sm:w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
                      {Number(tc.count).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t.topTransitions}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                N = {totalTransitions.toLocaleString()}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {transitions.slice(0, 15).map((tr, i) => {
                  const pct =
                    totalTransitions > 0 ? (Number(tr.count) / totalTransitions) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {tr.fromTool}
                        <span className="mx-1.5 text-muted-foreground">&rarr;</span>
                        {tr.toTool}
                      </span>
                      <span className="w-16 shrink-0 text-right tabular-nums text-foreground">
                        {Number(tr.count).toLocaleString()}
                      </span>
                      <span className="min-w-12 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <ToolTimingSection timings={data.toolTimings} />

      <TransitionHeatmap transitions={transitions} toolCount={toolCounts.length} />

      <WorkflowPatterns harness={harness} />

      <section>
        <SectionHeader label={t.explicitToolErrorRates} detail={toolErrorRates.length} />
        <div className="space-y-4">
          <ToolOsErrorRates rows={toolErrorRatesByOs} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t.anthropicToolResults}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.matchedResults(matchedToolResults.toLocaleString())} ·{' '}
                {t.anthropicToolResultsDescription}
              </p>
            </CardHeader>
            <CardContent>
              {toolErrorRates.length === 0 ? (
                <EmptyState bare className="py-8">
                  {t.noToolResultData}
                </EmptyState>
              ) : (
                <div
                  role="region"
                  aria-label={t.anthropicToolResultsAriaLabel}
                  tabIndex={0}
                  className="max-h-64 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
                >
                  <table className="w-full text-xs tabular-nums">
                    <thead className="sticky top-0 z-10 bg-background text-muted-foreground border-b border-border/20">
                      <tr>
                        <th className="text-left py-1.5 font-medium">{t.colTool}</th>
                        <th className="text-right py-1.5 font-medium">{t.colCalls}</th>
                        <th className="text-right py-1.5 font-medium">{t.colMatched}</th>
                        <th className="text-right py-1.5 font-medium">{t.colSuccess}</th>
                        <th className="text-right py-1.5 font-medium">{t.colErrors}</th>
                        <th className="text-right py-1.5 font-medium">{t.colUnknown}</th>
                        <th className="text-right py-1.5 font-medium">{t.colErrorRate}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {toolErrorRates.map((row) => (
                        <tr key={row.toolName}>
                          <td className="py-1.5 font-medium text-foreground">{row.toolName}</td>
                          <td className="py-1.5 text-right">{row.totalCalls.toLocaleString()}</td>
                          <td className="py-1.5 text-right">
                            {row.matchedResults.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-emerald-700 dark:text-emerald-400">
                            {row.successes.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-red-700 dark:text-red-400">
                            {row.errors.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">
                            {row.unknown.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right">{formatPct(row.errorRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader
          label={t.verificationLoopAnalysis}
          detail={verificationSummary.sessionsAnalyzed}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t.sessionOutcomeProxies}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                N = {verificationSummary.sessionsAnalyzed.toLocaleString()}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {sessionOutcomeCounts.map((outcome) => {
                  const total = Math.max(Number(verificationSummary.sessionsAnalyzed), 1);
                  const pct = Number(outcome.count) / total;
                  return (
                    <div
                      key={outcome.outcome}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 sm:flex"
                    >
                      <span
                        className="min-w-0 sm:w-36 shrink-0 truncate text-xs text-foreground"
                        title={t.outcomeLabels[outcome.outcome]}
                      >
                        {t.outcomeLabels[outcome.outcome]}
                      </span>
                      <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
                        <div
                          className="h-full rounded-sm"
                          style={{
                            width: `${pct * 100}%`,
                            minWidth: pct > 0 ? 2 : 0,
                            backgroundColor: OUTCOME_COLORS[outcome.outcome],
                          }}
                        />
                      </div>
                      <span className="sm:w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
                        {Number(outcome.count).toLocaleString()}
                      </span>
                      <span className="sm:w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {formatPct(pct)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                {t.sessionOutcomeDescription}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t.verificationCommandClasses}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                N = {verificationSummary.verificationAttempts.toLocaleString()}
              </p>
            </CardHeader>
            <CardContent>
              {verificationByKind.length === 0 ? (
                <EmptyState bare className="py-8">
                  {t.noVerificationCommands}
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="text-muted-foreground border-b border-border/20">
                      <tr>
                        <th className="text-left py-1.5 font-medium">{t.colKind}</th>
                        <th className="text-right py-1.5 font-medium">{t.colAttempts}</th>
                        <th className="text-right py-1.5 font-medium">{t.colAfterEdit}</th>
                        <th className="text-right py-1.5 font-medium">{t.colPass}</th>
                        <th className="text-right py-1.5 font-medium">{t.colFail}</th>
                        <th className="text-right py-1.5 font-medium">{t.colUnknown}</th>
                        <th className="text-right py-1.5 font-medium">{t.colFailRate}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {verificationByKind.map((row) => (
                        <tr key={row.kind}>
                          <td className="py-1.5 font-medium">{row.kind}</td>
                          <td className="py-1.5 text-right">{row.attempts.toLocaleString()}</td>
                          <td className="py-1.5 text-right">
                            {row.afterEditAttempts.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-emerald-700 dark:text-emerald-400">
                            {row.passes.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-red-700 dark:text-red-400">
                            {row.failures.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">
                            {row.unknown.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right">{formatPct(row.failureRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader label={t.agenticLoopDepth} detail={sessionToolStats.length} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SessionHistogram
            id="totalTools"
            title={t.toolCallsPerSession}
            values={totalToolValues}
            axisLabel={t.axisToolCalls}
            format={formatAxisNumber}
          />
          <SessionHistogram
            id="uniqueTools"
            title={t.uniqueToolsPerSession}
            values={uniqueToolValues}
            axisLabel={t.axisUniqueTools}
            format={formatAxisNumber}
          />
          <SessionHistogram
            id="diversity"
            title={t.toolDiversityRatio}
            values={diversityValues}
            axisLabel={t.axisRatio}
            format={formatRatio}
          />
        </div>
      </section>
    </div>
  );
}
