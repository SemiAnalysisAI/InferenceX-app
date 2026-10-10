'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HARNESSES,
  isHarness,
  type Harness,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ToolOsErrorRates,
  type ToolOsErrorRate,
} from '@/components/agentic-workload-explorer/tool-os-error-rates';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import { getToolColor } from '@/lib/agentic-workload-explorer/tool-colors';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';

// ── Types ────────────────────────────────────────────────────────

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
    // Raw SessionOutcome values from packages/db tool-analysis — the API's
    // camelKeys() converts object keys, not string values, so these stay snake_case.
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
  /** Present for single-harness views, which run live over a session sample. */
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

// The API returns this while the cache is being computed post-response. The
// page exposes an explicit cache-read retry instead of polling.
interface WarmingResponse {
  warming: true;
}

// The tool_analytics_cache table doesn't exist — migration 028 hasn't been
// applied to the database this deployment points at.
interface SetupRequiredResponse {
  setupRequired: true;
}

type ToolAnalyticsResponse = ToolAnalyticsData | WarmingResponse | SetupRequiredResponse;

// ── Histogram helpers (same as graphs page) ──────────────────────

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
  // Integer data with a compact range bins on whole-number edges over the
  // full range: a fractional step over integers leaves empty comb bins, and
  // the p95 clip below would silently drop a tail the percentile tiles
  // still report.
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
    // Whole-number step keeps bin edges aligned to integer values.
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

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

function generateTicks(min: number, max: number, targetCount: number): number[] {
  if (max <= min) return [min];
  const range = niceNum(max - min, false);
  const spacing = niceNum(range / (targetCount - 1), true);
  const niceMin = Math.floor(min / spacing) * spacing;
  const ticks: number[] = [];
  // Keep going until a tick reaches max, so the tallest bar is never clipped.
  for (let t = niceMin; t - spacing < max - spacing * 1e-9; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

function formatAxisValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  if (v < 1) return v.toFixed(2);
  return v.toFixed(1);
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

// Tool names partition almost perfectly by harness (Claude Code tools never
// occur in Codex sessions and vice versa), so the agent selector filters the
// tool list instead of re-aggregating samples. Generic OpenAI Responses
// clients share Codex's tool names and land under 'codex'.
const AGENT_FILTERS = ['all', 'claude', 'codex'] as const;
type AgentFilter = (typeof AGENT_FILTERS)[number];

type HarnessFilter = 'all' | Harness;

const STRINGS = {
  en: {
    // Y-axis label for histograms
    sessions: 'Sessions',
    // Transition heatmap
    hideSmall: 'Hide n<5',
    noTransitionData: 'No transition data',
    // Workflow Patterns section
    workflowPatterns: 'Workflow Patterns',
    workflowCacheMissing:
      "Workflow patterns are not yet built for this snapshot — they will appear once the snapshot's tool_analytics_cache is rebuilt.",
    workflowNotAvailable: 'Workflow patterns are not available in this snapshot.',
    workflowFetchError: (msg: string) => `Failed to read workflow patterns cache: ${msg}`,
    workflowNotEnough:
      'Not enough data to mine workflow patterns (need sessions with 3+ tool calls)',
    reload: 'Reload',
    reloadWorkflowAriaLabel: 'Reload workflow patterns',
    repeatShare: 'Repeat Share',
    repeatShareDetail: 'tool calls that repeat the previous tool back-to-back',
    longestStreak: 'Longest Streak',
    longestStreakDetail: 'most consecutive calls of a single tool in one session',
    sessionsMined: 'Sessions Mined',
    sessionsMinedDetail: (calls: string, steps: string) =>
      `${calls} tool calls → ${steps} collapsed steps`,
    recurringMotifs: 'Recurring Motifs',
    motifsSubtitle: (count: number, sessions: string) =>
      `(top ${count} · from ${sessions} sessions)`,
    motifsDescription:
      'Consecutive repeats are collapsed (Bash, Bash, Bash → one step) and only contiguous steps count, so each row is a real local workflow instead of a Bash permutation. ×N marks steps that average N repeated calls.',
    toolStreaks: 'Tool Streaks',
    toolStreaksDescription:
      'Maximal runs of the same tool called back-to-back — how bursty each tool is. Sessions counts sessions containing a streak of 2+.',
    colTool: 'Tool',
    colCalls: 'Calls',
    colRuns: 'Runs',
    colSessions: 'Sessions',
    pingPongLoops: 'Ping-Pong Loops',
    pingPongDescription:
      'Alternating A→B→A→B segments of 2+ full cycles — the edit/verify and read/tweak feedback loops. Cycles = A→B round trips per segment.',
    noRecurringLoops: 'No recurring loops found',
    // Tool Wall-Time section
    toolWallTime: 'Tool Wall-Time',
    turnaroundByTool: 'Turnaround by Tool',
    clientSideWallTime: '(client-side wall time)',
    turnaroundByToolDescription: (single: string, total: string, pct: string, batchLabel: string) =>
      `Time between a response ending in one tool_use and the next request in the same session lane carrying its tool_result — tool execution plus harness overhead. Single-tool turns only (${single} of ${total} tool turns, ${pct}%); turns with parallel tool calls are lumped under ${batchLabel}; gaps over 30 minutes are dropped as idle.`,
    turnaroundDistribution: 'Turnaround Distribution',
    colSamples: 'Samples',
    colMean: 'Mean',
    // OS turnaround cards
    turnaroundShapeByOs: 'Turnaround Shape by OS',
    splitByArch: 'Split by arch',
    turnaroundShapeDescription:
      'Share of samples per log-spaced bin, normalized per series. Session OS/arch come from client metadata (SDK headers, or the Codex user-agent when headers are absent). Dashed lines mark medians; platforms under 200 samples are hidden.',
    agent: 'Agent',
    tool: 'Tool',
    turnaroundAxisLabel: 'Turnaround (log scale)',
    medianTurnaroundByOs: (splitArch: boolean) =>
      `Median Turnaround by ${splitArch ? 'Platform' : 'OS'}`,
    medianTurnaroundDescription: (splitArch: boolean) =>
      `p50 with p90 below, per tool and ${splitArch ? 'OS/arch' : 'OS'}. Same client-side wall-time samples as the chart — differences are OS + machine + harness overhead, not model latency.`,
    // Bash breakdown
    bashBreakdown: 'Bash Breakdown',
    bashBreakdownDescription:
      "Split by the verification-kind classification already stored at ingest (raw commands never leave the proxy): test / typecheck / lint / build, everything else is 'other'. Timing columns come from the single-tool-turn samples above.",
    noBashCalls: 'No Bash calls',
    colKind: 'Kind',
    colShare: 'Share',
    bashBinaries: 'Bash — Binaries',
    bashBinariesDescription: (count: string) =>
      `Showing ${count} distinct binaries from the current analytics snapshot, sorted by invocation count. Includes shell command positions plus allowlisted verification tools referenced behind runners (for example, uv run pytest). Timing columns come from single-tool-turn samples attributed to the command's first binary.`,
    bashTopBinariesAriaLabel: 'Bash top binaries',
    colBinary: 'Binary',
    colInvocations: 'Invocations',
    // Pie Chart
    usageBreakdown: 'Usage Breakdown',
    // Shared labels
    batchLabel: '(parallel batch)',
    callsUnit: 'calls',
    // Loading / error states
    loadingToolAnalytics: 'Loading tool analytics...',
    cacheTableMissing: 'Tool analytics are not yet built for this snapshot',
    cacheTableMissingDetail:
      "Tool analytics will appear once the snapshot's tool_analytics_cache is rebuilt by the snapshot maintainer.",
    notAvailableInSnapshot: 'Tool analytics are not available in this snapshot.',
    notAvailableDetail: 'The frozen snapshot has no precomputed tool analytics for this view.',
    reloadToolAnalyticsAriaLabel: 'Reload tool analytics',
    failedToLoad: 'Failed to load tool analytics',
    retry: 'Retry',
    // Summary stats
    stats: 'Stats',
    totalToolCalls: 'Total Tool Calls',
    explicitToolErrorRate: 'Explicit Tool Error Rate',
    errorRateDetail: (errors: string, matched: string) =>
      `${errors} errors / ${matched} matched Anthropic results`,
    verifiedEdited: 'Verified Edited',
    verifiedEditedDetail: (verified: string, edited: string) =>
      `${verified} / ${edited} edited sessions`,
    finalVerifiedPass: 'Final Verified Pass',
    finalVerifiedPassDetail: (n: string) => `${n} edited sessions`,
    uniqueToolTypes: 'Unique Tool Types',
    sessionsAnalyzed: 'Sessions Analyzed',
    avgToolsPerSession: 'Avg Tools / Session',
    recoveredFailures: 'Recovered Failures',
    recoveredFailuresDetail: (recovered: string, total: string) =>
      `${recovered} recovered / ${total} sessions with final failure signal`,
    // Distribution section
    distribution: 'Distribution',
    toolUsageDistribution: 'Tool Usage Distribution',
    topTransitions: 'Top Transitions',
    // Transition Matrix section
    transitionMatrix: 'Transition Matrix',
    rowNormalizedProbability: 'row-normalized probability',
    rawCounts: 'raw counts',
    showCounts: 'Show Counts',
    showProbability: 'Show Probability',
    transitionMatrixDescription: (count: number) =>
      `Cell (i, j) = after tool i, tool j was called next. Top ${count} tools by usage.`,
    // Explicit Tool Error Rates section
    explicitToolErrorRates: 'Explicit Tool Error Rates',
    anthropicToolResults: 'Anthropic Tool Results',
    matchedResults: (n: string) => `(${n} matched results)`,
    anthropicToolResultsDescription:
      'Explicit error rate is errors divided by matched Anthropic tool results. OpenAI and Codex are excluded because their protocol does not carry the same error flag; unmatched Anthropic calls remain unknown.',
    noToolResultData: 'No tool result data',
    anthropicToolResultsAriaLabel: 'Anthropic tool results',
    colMatched: 'Matched',
    colSuccess: 'Success',
    colErrors: 'Errors',
    colUnknown: 'Unknown',
    colErrorRate: 'Error Rate',
    // Verification Loop
    verificationLoopAnalysis: 'Verification Loop Analysis',
    sessionOutcomeProxies: 'Session Outcome Proxies',
    sessionOutcomeDescription:
      'Session outcomes are proxies: pass/fail means the final recognized verification command after an edit passed or failed, not ground-truth task correctness.',
    verificationCommandClasses: 'Verification Command Classes',
    noVerificationCommands: 'No recognized verification commands',
    colAttempts: 'Attempts',
    colAfterEdit: 'After Edit',
    colPass: 'Pass',
    colFail: 'Fail',
    colFailRate: 'Fail Rate',
    // Agentic Loop Depth
    agenticLoopDepth: 'Agentic Loop Depth',
    toolCallsPerSession: 'Tool Calls per Session',
    uniqueToolsPerSession: 'Unique Tools per Session',
    toolDiversityRatio: 'Tool Diversity Ratio (unique / total)',
    axisToolCalls: 'Tool Calls',
    axisUniqueTools: 'Unique Tools',
    axisRatio: 'Ratio',
    noData: 'No data',
    binsClip: (bins: number, clipped: string) =>
      `${bins} bins${clipped ? ` · ${clipped} sessions above axis (~p95 clip)` : ''}`,
    outcomeLabels: {
      verified_pass: 'Verified Pass',
      fail_recovered: 'Fail Recovered',
      fail_unrecovered: 'Fail Unrecovered',
      edited_unverified: 'Edited Unverified',
      ambiguous: 'Ambiguous',
      no_edit: 'No Edit',
    } as Record<OutcomeKey, string>,
    agentLabels: { all: 'All', claude: 'Claude Code', codex: 'Codex' } as Record<
      AgentFilter,
      string
    >,
    harnessFilterLabels: {
      all: 'All Harnesses',
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
    sessions: '会话数',
    hideSmall: '隐藏 n<5',
    noTransitionData: '暂无转换数据',
    workflowPatterns: '工作流模式',
    workflowCacheMissing:
      '当前快照尚未构建工作流模式——待快照的 tool_analytics_cache 重建后自动显示。',
    workflowNotAvailable: '当前快照中无工作流模式数据。',
    workflowFetchError: (msg: string) => `读取工作流模式缓存失败：${msg}`,
    workflowNotEnough: '数据不足，无法挖掘工作流模式（需要含 3+ 次工具调用的会话）',
    reload: '重新加载',
    reloadWorkflowAriaLabel: '重新加载工作流模式',
    repeatShare: '重复占比',
    repeatShareDetail: '连续重复调用同一工具的比例',
    longestStreak: '最长连续调用',
    longestStreakDetail: '单会话中同一工具的最大连续调用次数',
    sessionsMined: '已分析会话数',
    sessionsMinedDetail: (calls: string, steps: string) =>
      `${calls} 次工具调用 → ${steps} 步（合并后）`,
    recurringMotifs: '常见模式',
    motifsSubtitle: (count: number, sessions: string) =>
      `(前 ${count} 个 · 来自 ${sessions} 个会话)`,
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
    turnaroundByTool: '按工具分组的响应时间',
    clientSideWallTime: '（客户端耗时）',
    turnaroundByToolDescription: (single: string, total: string, pct: string, batchLabel: string) =>
      `从 tool_use 响应结束到同一会话 lane 的下一条 tool_result 请求之间的时间——包含工具执行和 harness 开销。仅统计单工具 turn（${single} / ${total} 个 tool turns，${pct}%）；并行 tool call 的 turn 归入${batchLabel}；超过 30 分钟的间隔视为空闲已排除。`,
    turnaroundDistribution: '响应时间分布',
    colSamples: '样本数',
    colMean: '均值',
    turnaroundShapeByOs: '按操作系统的响应时间分布',
    splitByArch: '按架构拆分',
    turnaroundShapeDescription:
      '按对数间隔 bin 统计的样本占比，各系列独立归一化。会话的 OS/arch 来自客户端元数据（SDK headers，或 Codex user-agent）。虚线为中位数；样本不足 200 的平台已隐藏。',
    agent: 'Agent',
    tool: '工具',
    turnaroundAxisLabel: '响应时间（对数坐标）',
    medianTurnaroundByOs: (splitArch: boolean) =>
      `按${splitArch ? '平台' : '操作系统'}的中位响应时间`,
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
    usageBreakdown: '使用量分布',
    batchLabel: '（并行批次）',
    callsUnit: '次调用',
    loadingToolAnalytics: '正在加载工具分析数据...',
    cacheTableMissing: '当前快照尚未构建工具分析数据',
    cacheTableMissingDetail:
      '待快照的 tool_analytics_cache 由快照维护程序重建后，工具分析数据将自动显示。',
    notAvailableInSnapshot: '当前快照中无工具分析数据。',
    notAvailableDetail: '冻结快照中没有该视图的预计算工具分析数据。',
    reloadToolAnalyticsAriaLabel: '重新加载工具分析',
    failedToLoad: '加载工具分析数据失败',
    retry: '重试',
    stats: '统计',
    totalToolCalls: '总工具调用数',
    explicitToolErrorRate: '显式工具错误率',
    errorRateDetail: (errors: string, matched: string) =>
      `${errors} 个错误 / ${matched} 个 Anthropic 匹配结果`,
    verifiedEdited: '已验证已编辑',
    verifiedEditedDetail: (verified: string, edited: string) =>
      `${verified} / ${edited} 个已编辑会话`,
    finalVerifiedPass: '最终验证通过',
    finalVerifiedPassDetail: (n: string) => `${n} 个已编辑会话`,
    uniqueToolTypes: '工具类型数',
    sessionsAnalyzed: '已分析会话数',
    avgToolsPerSession: '平均每会话工具数',
    recoveredFailures: '已恢复失败',
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
    matchedResults: (n: string) => `(${n} 个匹配结果)`,
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

// ── SVG Histogram ────────────────────────────────────────────────

const CHART_WIDTH = 520;
const CHART_HEIGHT = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

function Histogram({
  buckets,
  color,
  values,
  axisLabel,
  format,
  title,
  exportFilename,
  yAxisLabel,
}: {
  buckets: Bucket[];
  color: string;
  values: number[];
  axisLabel: string;
  format?: (v: number) => string;
  title?: string;
  exportFilename?: string;
  yAxisLabel?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const svgRef = useRef<SVGSVGElement>(null);
  const sorted = useMemo(() => [...values].toSorted((a, b) => a - b), [values]);

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const xMin = buckets[0].min;
  const xMax = buckets.at(-1)!.max;

  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;
  const xTicks = generateTicks(xMin, xMax, 10);
  const fmt = format || formatAxisValue;

  const sx = (v: number) => MARGIN.left + ((v - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const pct = (p: number) =>
    sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
  const percentileColors: Record<string, string> = {
    p25: '#94a3b8',
    p50: '#ef4444',
    p75: '#94a3b8',
    p90: '#f59e0b',
    p95: '#f59e0b',
    p99: '#f43f5e',
  };
  const percentiles = [
    { label: 'p25', value: pct(25) },
    { label: 'p50', value: pct(50) },
    { label: 'p75', value: pct(75) },
    { label: 'p90', value: pct(90) },
    { label: 'p95', value: pct(95) },
    { label: 'p99', value: pct(99) },
  ];

  return (
    <Expandable title={title}>
      <div>
        {title && (
          <div className="flex items-center justify-end mb-2">
            <ExportPngButton
              locale={locale}
              onClick={() => {
                if (svgRef.current)
                  exportSvgToPng(svgRef.current, {
                    title,
                    filename: exportFilename || 'histogram.png',
                    svgWidth: CHART_WIDTH,
                    svgHeight: CHART_HEIGHT,
                  });
              }}
            />
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full"
          style={{ maxHeight: 220 }}
        >
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              {tick > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(tick)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(tick)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(tick) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
              >
                {formatAxisValue(tick)}
              </text>
            </g>
          ))}
          <text
            x={12}
            y={MARGIN.top + PLOT_H / 2}
            textAnchor="middle"
            transform={`rotate(-90, 12, ${MARGIN.top + PLOT_H / 2})`}
            className="fill-muted-foreground"
            style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
          >
            {yAxisLabel ?? t.sessions}
          </text>
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />
          {buckets.map((bucket, i) => {
            const x = sx(bucket.min);
            const w = sx(bucket.max) - sx(bucket.min);
            const h = (bucket.count / yMax) * PLOT_H;
            if (bucket.count === 0) return null;
            return (
              <rect
                key={i}
                x={x}
                y={sy(bucket.count)}
                width={Math.max(w - 0.5, 1)}
                height={h}
                fill={color}
                opacity={0.75}
                stroke={color}
                strokeWidth={0.5}
              />
            );
          })}
          {/* Percentile lines */}
          {sorted.length > 0 &&
            percentiles.map(({ label, value: val }) => {
              const px = sx(val);
              if (px < MARGIN.left || px > MARGIN.left + PLOT_W) return null;
              const lineColor = percentileColors[label] || '#94a3b8';
              return (
                <g key={label}>
                  <line
                    x1={px}
                    y1={MARGIN.top}
                    x2={px}
                    y2={MARGIN.top + PLOT_H}
                    stroke={lineColor}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={px}
                    y={MARGIN.top - 2}
                    textAnchor="middle"
                    fill={lineColor}
                    style={{
                      fontSize: '7px',
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    }}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          {xTicks.map((tick) => {
            const x = sx(tick);
            if (x < MARGIN.left - 1 || x > MARGIN.left + PLOT_W + 1) return null;
            return (
              <g key={`x-${tick}`}>
                <line
                  x1={x}
                  y1={MARGIN.top + PLOT_H}
                  x2={x}
                  y2={MARGIN.top + PLOT_H + 4}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={MARGIN.top + PLOT_H + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {fmt(tick)}
                </text>
              </g>
            );
          })}
          <text
            x={MARGIN.left + PLOT_W / 2}
            y={CHART_HEIGHT - 2}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
          >
            {axisLabel}
          </text>
        </svg>
        <div className="grid grid-cols-6 gap-1.5 mt-3 pt-3 border-t border-border">
          {percentiles.map((p) => (
            <div
              key={p.label}
              className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center"
            >
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {p.label}
              </div>
              <div className="text-sm font-mono font-bold tracking-tight mt-0.5">
                {fmt(p.value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Expandable>
  );
}

// ── Transition Heatmap ───────────────────────────────────────────

const CELL = 36;
const ROW_LABEL_W = 110;
const COL_LABEL_H = 100;

function cellColorFn(intensity: number): string {
  if (intensity === 0) return 'transparent';
  const a = 0.08 + intensity * 0.87;
  return `rgba(16, 185, 129, ${a.toFixed(2)})`;
}

function TransitionHeatmap({
  transitions,
  showProbability,
  hideSmallLabel,
  noDataLabel,
}: {
  transitions: { fromTool: string; toTool: string; count: number }[];
  showProbability: boolean;
  hideSmallLabel: string;
  noDataLabel: string;
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hideSmall, setHideSmall] = useState(true);
  // Rank tools by total involvement
  const tools = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transitions) {
      totals.set(t.fromTool, (totals.get(t.fromTool) || 0) + t.count);
      totals.set(t.toTool, (totals.get(t.toTool) || 0) + t.count);
    }
    return [...totals.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);
  }, [transitions]);

  // Build matrix
  const { matrix, rowSums, maxVal } = useMemo(() => {
    const m: number[][] = Array.from({ length: tools.length }, () =>
      Array.from<number>({ length: tools.length }).fill(0),
    );
    const idx = new Map(tools.map((t, i) => [t, i]));
    for (const t of transitions) {
      const fi = idx.get(t.fromTool);
      const ti = idx.get(t.toTool);
      if (fi !== undefined && ti !== undefined) m[fi][ti] = t.count;
    }
    const rs = m.map((row) => row.reduce((a, b) => a + b, 0));
    let mx = 0;
    for (const row of m) for (const v of row) if (v > mx && (!hideSmall || v >= 5)) mx = v;
    return { matrix: m, rowSums: rs, maxVal: mx };
  }, [transitions, tools, hideSmall]);

  const n = tools.length;
  if (n === 0)
    return <div className="text-sm text-muted-foreground text-center py-8">{noDataLabel}</div>;

  const W = ROW_LABEL_W + n * CELL;
  const H = COL_LABEL_H + n * CELL;

  function cellIntensity(row: number, col: number): number {
    const raw = matrix[row][col];
    if (raw === 0) return 0;
    if (showProbability) {
      const prob = rowSums[row] > 0 ? raw / rowSums[row] : 0;
      return prob;
    }
    return Math.log1p(raw) / Math.log1p(maxVal);
  }

  const cellColor = cellColorFn;

  function cellLabel(row: number, col: number): string {
    const raw = matrix[row][col];
    if (raw === 0) return '';
    if (showProbability) {
      const pct = rowSums[row] > 0 ? (raw / rowSums[row]) * 100 : 0;
      return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
    }
    return raw >= 1000 ? `${(raw / 1000).toFixed(1)}k` : String(raw);
  }

  return (
    <Expandable title={'Tool Transition Matrix'}>
      <div>
        <div className="flex items-center justify-end gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              track('agentic_workload_transition_hide_small_toggled', { hideSmall: !hideSmall });
              setHideSmall((h) => !h);
            }}
            className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
              hideSmall
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            {hideSmallLabel}
          </button>
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: 'Tool Transition Matrix',
                  filename: 'tool-transition-matrix.png',
                  svgWidth: W,
                  svgHeight: H,
                });
            }}
          />
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
          {/* Column labels (to tools) — vertical */}
          {tools.map((tool, j) => {
            const label = tool.length > 14 ? `${tool.slice(0, 13)}…` : tool;
            const cx = ROW_LABEL_W + j * CELL + CELL / 2;
            return (
              <text
                key={`col-${tool}`}
                x={cx}
                y={COL_LABEL_H - 4}
                textAnchor="start"
                transform={`rotate(-90, ${cx}, ${COL_LABEL_H - 4})`}
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fill: getToolColor(tool),
                }}
              >
                {label}
              </text>
            );
          })}

          {/* Row labels (from tools) */}
          {tools.map((tool, i) => {
            const label = tool.length > 14 ? `${tool.slice(0, 13)}…` : tool;
            return (
              <text
                key={`row-${tool}`}
                x={ROW_LABEL_W - 6}
                y={COL_LABEL_H + i * CELL + CELL / 2 + 3}
                textAnchor="end"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fill: getToolColor(tool),
                }}
              >
                {label}
              </text>
            );
          })}

          {/* Grid cells */}
          {tools.map((_fromTool, i) =>
            tools.map((_toTool, j) => {
              const raw = matrix[i][j];
              const hidden = hideSmall && raw < 5;
              const intensity = hidden ? 0 : cellIntensity(i, j);
              const x = ROW_LABEL_W + j * CELL;
              const y = COL_LABEL_H + i * CELL;
              return (
                <g key={`${i}-${j}`}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    fill={cellColor(intensity)}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={0.5}
                  />
                  {raw > 0 && !hidden && (
                    <text
                      x={x + CELL / 2}
                      y={y + CELL / 2 + 3}
                      textAnchor="middle"
                      fill={intensity > 0.5 ? '#ffffff' : 'currentColor'}
                      className={intensity > 0.5 ? undefined : 'fill-muted-foreground'}
                      style={{
                        fontSize: '7.5px',
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      }}
                    >
                      {cellLabel(i, j)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </Expandable>
  );
}

// ── Workflow Patterns (collapsed-run motifs, streaks, loops) ─────

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
  const color = getToolColor(tool);
  // ×N only when the step meaningfully repeats — every step trivially has ≥1.
  const showRun = avgRun !== undefined && avgRun >= 1.15;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-3xs font-mono font-medium"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}14`,
        color,
      }}
    >
      {tool}
      {showRun && <span className="opacity-70">×{avgRun.toFixed(1)}</span>}
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
        <SectionHeader label={t.workflowPatterns} count={0} />
        <Skeleton className="h-40 w-full rounded-md" />
      </section>
    );
  }

  if (data?.setupRequired) {
    return (
      <section>
        <SectionHeader label={t.workflowPatterns} count={0} />
        <Card>
          <CardContent className="py-6 text-center text-xs font-mono text-muted-foreground">
            {t.workflowCacheMissing}
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!data || data.motifs.length === 0) {
    const canRetry = Boolean(data?.warming || error);
    return (
      <section>
        <SectionHeader label={t.workflowPatterns} count={0} />
        <Card>
          <CardContent
            className="flex flex-col items-center gap-3 py-6 text-center text-xs font-mono text-muted-foreground"
            aria-live="polite"
          >
            <span>
              {data?.warming
                ? t.workflowNotAvailable
                : error
                  ? t.workflowFetchError(error.message)
                  : t.workflowNotEnough}
            </span>
            {canRetry && (
              <button
                type="button"
                onClick={() => {
                  track('agentic_workload_workflow_patterns_reload');
                  reload();
                }}
                aria-label={t.reloadWorkflowAriaLabel}
                className="border border-border bg-background px-3 py-1.5 text-3xs font-bold uppercase tracking-eyebrow text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.reload}
              </button>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }

  const { streaks, loops } = data;
  const motifs = data.motifs.slice(0, 10);
  const maxSupport = motifs[0]?.support ?? 1;

  return (
    <section>
      <SectionHeader label={t.workflowPatterns} count={motifs.length} />

      {/* Repetition summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
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
          <div key={stat.label} className="rounded-md border border-border bg-surface p-3">
            <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground mb-1.5">
              {stat.label}
            </div>
            <div className="text-lg font-mono font-bold tracking-tight">{stat.value}</div>
            <p className="text-3xs text-muted-foreground mt-1 leading-relaxed font-mono">
              {stat.detail}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            {t.recurringMotifs}{' '}
            <span className="text-muted-foreground font-normal">
              {t.motifsSubtitle(motifs.length, data.totalSessions.toLocaleString())}
            </span>
          </CardTitle>
          <p className="text-3xs font-mono text-subtle mt-0.5">{t.motifsDescription}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {motifs.map((m, i) => {
              const pct = (m.supportRatio * 100).toFixed(1);
              const barPct = (m.support / maxSupport) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 text-right text-3xs font-mono text-subtle shrink-0">
                    #{i + 1}
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                    {m.pattern.map((tool, ti) => (
                      <span key={ti} className="flex items-center gap-0.5">
                        {ti > 0 && <span className="text-3xs text-subtle mx-0.5">&rarr;</span>}
                        <ToolChip tool={tool} avgRun={m.avgRuns[ti]} />
                      </span>
                    ))}
                  </div>
                  <div className="w-24 sm:w-48 shrink-0">
                    <div className="h-4 bg-background rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/30 rounded"
                        style={{ width: `${Math.max(barPct, 3)}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-20 text-right text-3xs font-mono text-muted-foreground shrink-0">
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
            <p className="text-3xs font-mono text-subtle mt-0.5">{t.toolStreaksDescription}</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-2xs font-mono">
                <thead className="text-muted-foreground border-b border-border">
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
                <tbody className="divide-y divide-border">
                  {streaks.map((row) => (
                    <tr key={row.tool}>
                      <td className="py-1.5 font-medium" style={{ color: getToolColor(row.tool) }}>
                        {row.tool}
                      </td>
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
            <p className="text-3xs font-mono text-subtle mt-0.5">{t.pingPongDescription}</p>
          </CardHeader>
          <CardContent>
            {loops.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t.noRecurringLoops}</p>
            ) : (
              <div className="space-y-1.5">
                {loops.map((loop) => {
                  const pct = (loop.supportRatio * 100).toFixed(1);
                  return (
                    <div
                      key={loop.pair.join('→')}
                      className="flex items-center gap-2 text-2xs font-mono"
                    >
                      <div className="flex items-center gap-1 w-[190px] shrink-0">
                        <ToolChip tool={loop.pair[0]} />
                        <span className="text-3xs text-subtle">&harr;</span>
                        <ToolChip tool={loop.pair[1]} />
                      </div>
                      <span className="flex-1 border-b border-dotted border-border" />
                      <span className="text-muted-foreground shrink-0">
                        {loop.sessions.toLocaleString()} sessions ({pct}%)
                      </span>
                      <span className="text-subtle shrink-0 w-24 text-right">
                        p50 {loop.p50Cycles} · max {loop.maxCycles} cyc
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

// ── Section Header (matches overview page) ──────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
      <span className="text-3xs font-mono text-subtle">{count}</span>
    </div>
  );
}

// ── Tool wall-time distributions ─────────────────────────────────

// Must stay in sync with TIMING_BIN_EDGES_MS in packages/db (width_bucket
// output: bin 0 = below the first edge, bin 9 = 5–30min; >30min is dropped
// server-side as idle).
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

// ── Turnaround by OS ─────────────────────────────────────────────

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

// Aggregate turnaround curve across the common Claude Code tools, exposed as an
// "All" pseudo-tool in the tool row. Its median is interpolated from the
// combined histogram (per-tool rows carry exact SQL percentiles; the aggregate
// can't), so it appears only when at least one of these tools is present.
const ALL_TOOL = 'All';
const ALL_AGG_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'TaskUpdate', 'Grep'];

// Must stay in sync with os_fine_histogram in packages/db operations:
// bin b covers gaps around 10^(b/8) ms.
const FINE_BINS_PER_DECADE = 8;
// Display window: ~30ms to ~3min. Mass outside (well under 1% of samples)
// is clipped from the curve, not from the medians.
const FINE_BIN_MIN = 12;
const FINE_BIN_MAX = 42;

function fineBinMs(bin: number): number {
  return 10 ** (bin / FINE_BINS_PER_DECADE);
}

// Approximate p50 from the log-spaced histogram, interpolating in log-space
// within the crossing bin. Used for the "All" aggregate, which has no exact
// percentile from SQL.
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
  const svgRef = useRef<SVGSVGElement>(null);

  // Tools ordered by total sample volume across OSes.
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

  // The named common tools present under the current agent filter; when any
  // exist an "All" pseudo-tool aggregating them heads the tool row.
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

  // One displayed series per platform: OS level by default, (os, arch) when
  // split. Only combos that passed the server-side sample floor appear.
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
    // "All" sums the named common tools per platform straight from the fine
    // histogram; its median is interpolated from those combined bins and it
    // has no single session count.
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

  // Shared x-domain across the displayed series, clipped to the window.
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

  let yMax = 0;
  for (const s of series) {
    if (s.total === 0) continue;
    for (const [bin, count] of s.bins) {
      if (bin < lo || bin > hi) continue;
      yMax = Math.max(yMax, count / s.total);
    }
  }
  if (yMax === 0) yMax = 1;

  const sx = (bin: number) => MARGIN.left + ((bin - lo) / (hi - lo)) * PLOT_W;
  const sy = (share: number) => MARGIN.top + PLOT_H - (share / yMax) * PLOT_H;

  const decadeTicks = [];
  for (let bin = Math.ceil(lo / 8) * 8; bin <= hi; bin += 8) decadeTicks.push(bin);

  return (
    <Expandable title={`${activeTool} turnaround by ${splitArch ? 'OS/arch' : 'OS'}`}>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t.turnaroundShapeByOs}</CardTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    track('agentic_workload_turnaround_split_arch_toggled', {
                      splitArch: !splitArch,
                    });
                    setSplitArch((v) => !v);
                  }}
                  className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
                    splitArch
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
                  }`}
                >
                  {t.splitByArch}
                </button>
                <ExportPngButton
                  locale={locale}
                  onClick={() => {
                    if (svgRef.current)
                      exportSvgToPng(svgRef.current, {
                        title: `${activeTool} turnaround by ${splitArch ? 'OS/arch' : 'OS'}`,
                        filename: `turnaround-by-os-${activeTool.toLowerCase()}.png`,
                        svgWidth: CHART_WIDTH,
                        svgHeight: CHART_HEIGHT,
                      });
                  }}
                />
              </div>
            </div>
            <p className="text-3xs font-mono text-subtle mt-0.5">{t.turnaroundShapeDescription}</p>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-start gap-2">
                <span className="w-12 shrink-0 pt-1 text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                  {t.agent}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {availableAgents.map((agent) => (
                    <button
                      key={agent}
                      type="button"
                      onClick={() => {
                        track('agentic_workload_turnaround_agent_filter_changed', { agent });
                        setAgentFilter(agent);
                      }}
                      className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
                        agent === agentFilter
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      {t.agentLabels[agent]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-12 shrink-0 pt-1 text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                  {t.tool}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {selectableTools.map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => {
                        track('agentic_workload_turnaround_tool_selected', { tool });
                        setSelected(tool);
                      }}
                      className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
                        tool === activeTool
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full"
              style={{ maxHeight: 220 }}
            >
              <line
                x1={MARGIN.left}
                y1={MARGIN.top + PLOT_H}
                x2={MARGIN.left + PLOT_W}
                y2={MARGIN.top + PLOT_H}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1}
              />
              {decadeTicks.map((bin) => (
                <g key={bin}>
                  <line
                    x1={sx(bin)}
                    y1={MARGIN.top}
                    x2={sx(bin)}
                    y2={MARGIN.top + PLOT_H}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={0.5}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={sx(bin)}
                    y={MARGIN.top + PLOT_H + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    }}
                  >
                    {formatMs(fineBinMs(bin))}
                  </text>
                </g>
              ))}
              {series.map(({ key, bins, total, p50Ms }) => {
                if (total === 0) return null;
                const color = platformColor(key);
                const points = [];
                for (let bin = lo; bin <= hi; bin++) {
                  points.push(
                    `${sx(bin + 0.5).toFixed(1)},${sy((bins.get(bin) ?? 0) / total).toFixed(1)}`,
                  );
                }
                const baseline = (MARGIN.top + PLOT_H).toFixed(1);
                const area = `M ${sx(lo + 0.5).toFixed(1)} ${baseline} L ${points.join(' L ')} L ${sx(hi + 0.5).toFixed(1)} ${baseline} Z`;
                const p50Bin =
                  p50Ms === null
                    ? null
                    : Math.log10(Math.max(Number(p50Ms), 1)) * FINE_BINS_PER_DECADE;
                return (
                  <g key={key}>
                    <path d={area} fill={color} fillOpacity={0.1} />
                    <polyline
                      points={points.join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                    />
                    {p50Bin !== null && p50Bin >= lo && p50Bin <= hi && (
                      <line
                        x1={sx(p50Bin)}
                        y1={MARGIN.top}
                        x2={sx(p50Bin)}
                        y2={MARGIN.top + PLOT_H}
                        stroke={color}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        opacity={0.6}
                      />
                    )}
                  </g>
                );
              })}
              <text
                x={MARGIN.left + PLOT_W / 2}
                y={CHART_HEIGHT - 2}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
              >
                {t.turnaroundAxisLabel}
              </text>
            </svg>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
              {series.map(({ key, total, p50Ms, sessions }) => (
                <span key={key} className="flex items-center gap-1.5 text-3xs font-mono">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: platformColor(key) }}
                  />
                  <span style={{ color: platformColor(key) }}>{key}</span>
                  <span className="text-muted-foreground">
                    n={total.toLocaleString()}
                    {sessions !== null && ` · ${sessions.toLocaleString()} sess`}
                    {p50Ms !== null && ` · p50 ${formatMs(p50Ms)}`}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t.medianTurnaroundByOs(splitArch)}</CardTitle>
            <p className="text-3xs font-mono text-subtle mt-0.5">
              {t.medianTurnaroundDescription(splitArch)}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-2xs font-mono">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-1.5 font-medium">{t.colTool}</th>
                    {tableColumns.map((col) => (
                      <th key={col.key} className="text-right py-1.5 font-medium">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5"
                          style={{ backgroundColor: platformColor(col.key) }}
                        />
                        {col.arch ? `${col.os} ${col.arch}` : col.os}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTools.map((tool) => (
                    <tr key={tool}>
                      <td className="py-1.5 font-medium" style={{ color: getToolColor(tool) }}>
                        {tool}
                      </td>
                      {tableColumns.map((col) => {
                        const stat = statFor(col, tool);
                        return (
                          <td key={col.key} className="py-1.5 text-right align-top">
                            {stat ? (
                              <>
                                <div>{formatMs(stat.p50Ms)}</div>
                                <div className="text-3xs text-subtle">
                                  p90 {formatMs(stat.p90Ms)}
                                </div>
                              </>
                            ) : (
                              <span className="text-subtle">—</span>
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
    </Expandable>
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
      <SectionHeader label={t.toolWallTime} count={perTool.length} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              {t.turnaroundByTool}{' '}
              <span className="text-muted-foreground font-normal">{t.clientSideWallTime}</span>
            </CardTitle>
            <p className="text-3xs font-mono text-subtle mt-0.5">
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
              <table className="w-full text-2xs font-mono">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-1.5 font-medium">{t.colTool}</th>
                    <th className="text-right py-1.5 font-medium">{t.colSamples}</th>
                    <th className="text-right py-1.5 font-medium">p50</th>
                    <th className="text-right py-1.5 font-medium">p90</th>
                    <th className="text-right py-1.5 font-medium">p99</th>
                    <th className="text-right py-1.5 font-medium">{t.colMean}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perTool.slice(0, 14).map((row) => (
                    <tr key={row.toolName}>
                      <td
                        className="py-1.5 font-medium"
                        style={{
                          color:
                            row.toolName === BATCH_LABEL ? '#6b7280' : getToolColor(row.toolName),
                        }}
                      >
                        {row.toolName}
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
              <CardTitle>
                {t.turnaroundDistribution}{' '}
                <span className="text-muted-foreground font-normal">
                  (N={binTotal.toLocaleString()})
                </span>
              </CardTitle>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selectable.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => {
                    track('agentic_workload_timing_tool_selected', { tool });
                    setSelected(tool);
                  }}
                  className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
                    tool === activeTool
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
                  }`}
                >
                  {tool}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {TIMING_BIN_LABELS.map((label, i) => {
                const count = bins[i];
                const pct = binTotal > 0 ? (count / binTotal) * 100 : 0;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-14 text-right text-2xs font-mono text-muted-foreground shrink-0">
                      {label}
                    </span>
                    <div className="flex-1 h-4 rounded-sm overflow-hidden bg-surface-hover">
                      <div
                        className="h-full rounded-sm transition-all"
                        style={{
                          width: `${(count / maxBin) * 100}%`,
                          backgroundColor: activeTool ? getToolColor(activeTool) : '#6b7280',
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="w-24 text-right text-2xs font-mono text-muted-foreground shrink-0">
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
            <CardTitle>
              {t.bashBreakdown}{' '}
              <span className="text-muted-foreground font-normal">
                (N={bashTotal.toLocaleString()} {t.callsUnit})
              </span>
            </CardTitle>
            <p className="text-3xs font-mono text-subtle mt-0.5">{t.bashBreakdownDescription}</p>
          </CardHeader>
          <CardContent>
            {bashRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.noBashCalls}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-2xs font-mono">
                  <thead className="text-muted-foreground border-b border-border">
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
                  <tbody className="divide-y divide-border">
                    {bashRows.map((row) => {
                      const share = bashTotal > 0 ? (row.count / bashTotal) * 100 : 0;
                      return (
                        <tr key={row.kind}>
                          <td className="py-1.5 font-medium">{row.kind}</td>
                          <td className="py-1.5 text-right">{row.count.toLocaleString()}</td>
                          <td className="py-1.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 rounded-sm overflow-hidden bg-surface-hover">
                                <div
                                  className="h-full rounded-sm"
                                  style={{
                                    width: `${share}%`,
                                    backgroundColor: getToolColor('Bash'),
                                    opacity: 0.7,
                                  }}
                                />
                              </div>
                              <span className="w-12 text-right text-muted-foreground shrink-0">
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
              <CardTitle>
                {t.bashBinaries}{' '}
                <span className="text-muted-foreground font-normal">
                  (N={binaryTotal.toLocaleString()} invocations)
                </span>
              </CardTitle>
              <p className="text-3xs font-mono text-subtle mt-0.5">
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
                <table className="w-full text-2xs font-mono">
                  <thead className="sticky top-0 z-10 bg-background text-muted-foreground border-b border-border">
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
                  <tbody className="divide-y divide-border">
                    {binaryRows.map((row) => {
                      const share = binaryTotal > 0 ? (row.count / binaryTotal) * 100 : 0;
                      return (
                        <tr key={row.binary}>
                          <td className="py-1.5 font-medium">{row.binary}</td>
                          <td className="py-1.5 text-right">{row.count.toLocaleString()}</td>
                          <td className="py-1.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 rounded-sm overflow-hidden bg-surface-hover">
                                <div
                                  className="h-full rounded-sm"
                                  style={{
                                    width: `${share}%`,
                                    backgroundColor: getToolColor('Bash'),
                                    opacity: 0.7,
                                  }}
                                />
                              </div>
                              <span className="w-12 text-right text-muted-foreground shrink-0">
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

// ── Pie Chart with "Other" grouping ──────────────────────────────

interface PieSlice {
  label: string;
  count: number;
  fraction: number;
  color: string;
  items?: { toolName: string; count: number }[];
}

function PieChartSection({
  toolCounts,
  totalToolCalls,
}: {
  toolCounts: { toolName: string; count: number }[];
  totalToolCalls: number;
}) {
  const [hoveredSlice, setHoveredSlice] = useState<PieSlice | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const slices = useMemo(() => {
    const major: PieSlice[] = [];
    const minorItems: { toolName: string; count: number }[] = [];
    let minorTotal = 0;

    for (const tc of toolCounts) {
      const fraction = Number(tc.count) / totalToolCalls;
      if (fraction >= 0.01) {
        major.push({
          label: tc.toolName,
          count: Number(tc.count),
          fraction,
          color: getToolColor(tc.toolName),
        });
      } else {
        minorItems.push({ toolName: tc.toolName, count: Number(tc.count) });
        minorTotal += Number(tc.count);
      }
    }

    if (minorItems.length > 0) {
      major.push({
        label: 'Other',
        count: minorTotal,
        fraction: minorTotal / totalToolCalls,
        color: '#6b7280',
        items: minorItems,
      });
    }

    return major;
  }, [toolCounts, totalToolCalls]);

  const t = STRINGS[useLocale()];
  return (
    <section>
      <SectionHeader label={t.usageBreakdown} count={toolCounts.length} />
      <Expandable title={t.usageBreakdown} corner>
        <div ref={containerRef} className="rounded-md border border-border bg-surface p-4 relative">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            {/* SVG Pie */}
            <div className="shrink-0">
              <svg viewBox="-1.1 -1.1 2.2 2.2" width={220} height={220}>
                {(() => {
                  // Pre-compute paths for all slices
                  const paths: { slice: PieSlice; d: string }[] = [];
                  let cumAngle = -Math.PI / 2;
                  for (const slice of slices) {
                    const angle = slice.fraction * Math.PI * 2;
                    const x1 = Math.cos(cumAngle);
                    const y1 = Math.sin(cumAngle);
                    cumAngle += angle;
                    const x2 = Math.cos(cumAngle);
                    const y2 = Math.sin(cumAngle);
                    const largeArc = angle > Math.PI ? 1 : 0;
                    paths.push({
                      slice,
                      d: `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArc} 1 ${x2} ${y2} Z`,
                    });
                  }
                  // Render hovered slice last so it paints on top
                  const sorted = hoveredSlice
                    ? [
                        ...paths.filter((p) => p.slice.label !== hoveredSlice.label),
                        ...paths.filter((p) => p.slice.label === hoveredSlice.label),
                      ]
                    : paths;
                  return sorted.map(({ slice, d }) => {
                    const isHovered = hoveredSlice?.label === slice.label;
                    return (
                      <path
                        key={slice.label}
                        d={d}
                        fill={slice.color}
                        fillOpacity={hoveredSlice ? (isHovered ? 1 : 0.4) : 0.85}
                        stroke="var(--bg)"
                        strokeWidth={0.02}
                        style={{
                          cursor: 'pointer',
                          transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                          transformOrigin: 'center',
                          transition: 'fill-opacity 150ms, transform 150ms',
                        }}
                        onMouseEnter={(e) => {
                          setHoveredSlice(slice);
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (rect) {
                            setTooltipPos({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                        }}
                        onMouseMove={(e) => {
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (rect) {
                            setTooltipPos({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    );
                  });
                })()}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
              {slices.map((slice) => (
                <div
                  key={slice.label}
                  className="flex items-center gap-2"
                  onMouseEnter={() => setHoveredSlice(slice)}
                  onMouseLeave={() => setHoveredSlice(null)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-2xs font-mono truncate">{slice.label}</span>
                  <span className="text-3xs font-mono text-muted-foreground ml-auto tabular-nums">
                    {(slice.fraction * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Hover tooltip */}
          {hoveredSlice && (
            <div
              className="absolute z-50 pointer-events-none rounded-md border border-border bg-background shadow-lg px-3 py-2 text-2xs font-mono max-w-[240px]"
              style={{
                left: Math.min(tooltipPos.x + 16, (containerRef.current?.clientWidth || 500) - 250),
                top: tooltipPos.y > 200 ? tooltipPos.y - 20 : tooltipPos.y + 16,
              }}
            >
              <div className="font-bold mb-1">
                {hoveredSlice.label}: {hoveredSlice.count.toLocaleString()} (
                {(hoveredSlice.fraction * 100).toFixed(1)}%)
              </div>
              {hoveredSlice.items && (
                <div className="space-y-0.5 border-t border-border pt-1 mt-1">
                  {hoveredSlice.items.map((item) => (
                    <div
                      key={item.toolName}
                      className="flex justify-between gap-3 text-muted-foreground"
                    >
                      <span>{item.toolName}</span>
                      <span className="tabular-nums">
                        {Number(item.count).toLocaleString()} (
                        {((Number(item.count) / totalToolCalls) * 100).toFixed(2)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Expandable>
    </section>
  );
}

// ── Main Page ────────────────────────────────────────────────────

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('harness');
  const harness: HarnessFilter = isHarness(raw) ? raw : 'all';

  function setHarness(value: HarnessFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete('harness');
    else params.set('harness', value);
    const qs = params.toString();
    router.replace(`/tool-analytics${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1">
        {HARNESS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              track('agentic_workload_harness_filter_changed', { harness: f.value });
              setHarness(f.value);
            }}
            className={`px-2.5 py-1 text-3xs font-mono uppercase tracking-wider rounded-md transition-colors ${
              harness === f.value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            {t.harnessFilterLabels[f.value]}
          </button>
        ))}
      </div>
      <ToolAnalyticsView harness={harness} />
    </div>
  );
}

function ToolAnalyticsView({ harness }: { harness: HarnessFilter }) {
  const t = STRINGS[useLocale()];
  const [showProbability, setShowProbability] = useState(false);

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
        <div className="text-2xs font-mono text-muted-foreground">{t.loadingToolAnalytics}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-3">
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
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm font-mono">
        <div>{t.cacheTableMissing}</div>
        <div className="text-3xs text-subtle">{t.cacheTableMissingDetail}</div>
      </div>
    );
  }

  if (response && isWarmingResponse(response)) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center gap-3 text-sm font-mono text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <div>{t.notAvailableInSnapshot}</div>
        <div className="text-3xs text-subtle">{t.notAvailableDetail}</div>
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_tool_analytics_reload');
            reload();
          }}
          aria-label={t.reloadToolAnalyticsAriaLabel}
          className="border border-border bg-background px-3 py-1.5 text-3xs font-bold uppercase tracking-eyebrow text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.reload}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm font-mono text-muted-foreground">
        <div>
          {t.failedToLoad}
          {loadError ? `: ${loadError.message}` : ''}
        </div>
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_tool_analytics_retry');
            reload();
          }}
          className="border border-border bg-background px-3 py-1.5 text-3xs font-bold uppercase tracking-eyebrow text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.retry}
        </button>
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
        <div className="text-3xs font-mono text-muted-foreground">
          {t.sessionSample(
            data.sample.sessions.toLocaleString(),
            data.sample.totalSessions.toLocaleString(),
            data.sample.requests.toLocaleString(),
            data.sample.totalRequests.toLocaleString(),
          )}
        </div>
      )}

      {/* ── Summary Stats ──────────────────────────────────────── */}
      <section>
        <SectionHeader label={t.stats} count={8} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
            <div key={stat.label} className="rounded-md border border-border bg-surface p-3">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground mb-1.5">
                {stat.label}
              </div>
              <div className="text-lg font-mono font-bold tracking-tight">{stat.value}</div>
              {'detail' in stat && stat.detail && (
                <p className="text-3xs text-muted-foreground mt-1 leading-relaxed font-mono">
                  {stat.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Pie Chart ─────────────────────────────────────────── */}
      <PieChartSection toolCounts={toolCounts} totalToolCalls={totalToolCalls} />

      {/* ── Tool Usage + Top Transitions ───────────────────────── */}
      <section>
        <SectionHeader label={t.distribution} count={Math.min(toolCounts.length, 15)} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                {t.toolUsageDistribution}{' '}
                <span className="text-muted-foreground font-normal">
                  (N={totalToolCalls.toLocaleString()})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {toolCounts.slice(0, 15).map((tc) => (
                  <div key={tc.toolName} className="flex items-center gap-2">
                    <span
                      className="w-[180px] text-right text-2xs font-mono font-medium shrink-0 truncate"
                      style={{ color: getToolColor(tc.toolName) }}
                      title={tc.toolName}
                    >
                      {tc.toolName}
                    </span>
                    <div className="flex-1 h-4 rounded-sm overflow-hidden bg-surface-hover">
                      <div
                        className="h-full rounded-sm transition-all"
                        style={{
                          width: `${(Number(tc.count) / maxToolCount) * 100}%`,
                          backgroundColor: getToolColor(tc.toolName),
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="w-14 text-right text-2xs font-mono text-muted-foreground shrink-0">
                      {Number(tc.count).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                {t.topTransitions}{' '}
                <span className="text-muted-foreground font-normal">
                  (N={totalTransitions.toLocaleString()})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {transitions.slice(0, 15).map((tr, i) => {
                  const pct =
                    totalTransitions > 0 ? (Number(tr.count) / totalTransitions) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 text-2xs font-mono">
                      <span className="shrink-0" style={{ color: getToolColor(tr.fromTool) }}>
                        {tr.fromTool}
                      </span>
                      <span className="text-muted-foreground shrink-0">&rarr;</span>
                      <span className="shrink-0" style={{ color: getToolColor(tr.toTool) }}>
                        {tr.toTool}
                      </span>
                      <span className="flex-1 border-b border-dotted border-border" />
                      <span className="text-muted-foreground shrink-0">
                        {Number(tr.count).toLocaleString()}
                      </span>
                      <span className="text-subtle shrink-0 w-12 text-right">
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

      {/* ── Tool Wall-Time ─────────────────────────────────────── */}
      <ToolTimingSection timings={data.toolTimings} />

      {/* ── Transition Matrix ──────────────────────────────────── */}
      <section>
        <SectionHeader label={t.transitionMatrix} count={transitions.length} />
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>
                {t.transitionMatrix}{' '}
                <span className="text-muted-foreground font-normal">
                  ({showProbability ? t.rowNormalizedProbability : t.rawCounts})
                </span>
              </CardTitle>
              <button
                type="button"
                onClick={() => {
                  track('agentic_workload_transition_mode_toggled', {
                    showProbability: !showProbability,
                  });
                  setShowProbability((v) => !v);
                }}
                className="px-2 py-0.5 text-3xs font-mono rounded border border-border bg-surface-hover hover:bg-surface text-muted-foreground hover:text-foreground transition-colors"
              >
                {showProbability ? t.showCounts : t.showProbability}
              </button>
            </div>
            <p className="text-3xs font-mono text-subtle mt-0.5">
              {t.transitionMatrixDescription(Math.min(15, toolCounts.length))}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <TransitionHeatmap
                transitions={transitions}
                showProbability={showProbability}
                hideSmallLabel={t.hideSmall}
                noDataLabel={t.noTransitionData}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Workflow Patterns ─────────────────────────────────── */}
      <WorkflowPatterns harness={harness} />

      {/* ── Tool Error Rates ───────────────────────────────────── */}
      <section>
        <SectionHeader label={t.explicitToolErrorRates} count={toolErrorRates.length} />
        <div className="space-y-4">
          <ToolOsErrorRates rows={toolErrorRatesByOs} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                {t.anthropicToolResults}{' '}
                <span className="text-muted-foreground font-normal">
                  {t.matchedResults(matchedToolResults.toLocaleString())}
                </span>
              </CardTitle>
              <p className="text-3xs font-mono text-subtle mt-0.5">
                {t.anthropicToolResultsDescription}
              </p>
            </CardHeader>
            <CardContent>
              {toolErrorRates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t.noToolResultData}
                </p>
              ) : (
                <div
                  role="region"
                  aria-label={t.anthropicToolResultsAriaLabel}
                  tabIndex={0}
                  className="max-h-64 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
                >
                  <table className="w-full text-2xs font-mono">
                    <thead className="sticky top-0 z-10 bg-background text-muted-foreground border-b border-border">
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
                    <tbody className="divide-y divide-border">
                      {toolErrorRates.map((row) => (
                        <tr key={row.toolName}>
                          <td
                            className="py-1.5 font-medium"
                            style={{ color: getToolColor(row.toolName) }}
                          >
                            {row.toolName}
                          </td>
                          <td className="py-1.5 text-right">{row.totalCalls.toLocaleString()}</td>
                          <td className="py-1.5 text-right">
                            {row.matchedResults.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-emerald-500">
                            {row.successes.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-red-500">
                            {row.errors.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-subtle">
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

      {/* ── Verification Loop Analysis ─────────────────────────── */}
      <section>
        <SectionHeader
          label={t.verificationLoopAnalysis}
          count={verificationSummary.sessionsAnalyzed}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                {t.sessionOutcomeProxies}{' '}
                <span className="text-muted-foreground font-normal">
                  (N={verificationSummary.sessionsAnalyzed.toLocaleString()})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {sessionOutcomeCounts.map((outcome) => {
                  const total = Math.max(Number(verificationSummary.sessionsAnalyzed), 1);
                  const pct = Number(outcome.count) / total;
                  return (
                    <div key={outcome.outcome} className="flex items-center gap-2">
                      <span className="w-[150px] text-right text-2xs font-mono font-medium shrink-0">
                        {t.outcomeLabels[outcome.outcome]}
                      </span>
                      <div className="flex-1 h-4 rounded-sm overflow-hidden bg-surface-hover">
                        <div
                          className="h-full rounded-sm transition-all"
                          style={{
                            width: `${pct * 100}%`,
                            backgroundColor: OUTCOME_COLORS[outcome.outcome],
                            opacity: 0.75,
                          }}
                        />
                      </div>
                      <span className="w-14 text-right text-2xs font-mono text-muted-foreground shrink-0">
                        {Number(outcome.count).toLocaleString()}
                      </span>
                      <span className="w-12 text-right text-2xs font-mono text-subtle shrink-0">
                        {formatPct(pct)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-3xs font-mono text-subtle mt-3 leading-relaxed">
                {t.sessionOutcomeDescription}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                {t.verificationCommandClasses}{' '}
                <span className="text-muted-foreground font-normal">
                  (N={verificationSummary.verificationAttempts.toLocaleString()})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {verificationByKind.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t.noVerificationCommands}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-2xs font-mono">
                    <thead className="text-muted-foreground border-b border-border">
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
                    <tbody className="divide-y divide-border">
                      {verificationByKind.map((row) => (
                        <tr key={row.kind}>
                          <td className="py-1.5 font-medium">{row.kind}</td>
                          <td className="py-1.5 text-right">{row.attempts.toLocaleString()}</td>
                          <td className="py-1.5 text-right">
                            {row.afterEditAttempts.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-emerald-500">
                            {row.passes.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-red-500">
                            {row.failures.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-subtle">
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

      {/* ── Agentic Loop Depth ─────────────────────────────────── */}
      <section>
        <SectionHeader label={t.agenticLoopDepth} count={sessionToolStats.length} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            {
              key: 'totalTools',
              title: t.toolCallsPerSession,
              color: '#8b5cf6',
              values: totalToolValues,
              axisLabel: t.axisToolCalls,
              format: (v: number) => String(Math.round(v)),
            },
            {
              key: 'uniqueTools',
              title: t.uniqueToolsPerSession,
              color: '#0ea5e9',
              values: uniqueToolValues,
              axisLabel: t.axisUniqueTools,
              format: (v: number) => String(Math.round(v)),
            },
            {
              key: 'diversity',
              title: t.toolDiversityRatio,
              color: '#10b981',
              values: diversityValues,
              axisLabel: t.axisRatio,
              format: (v: number) => v.toFixed(2),
            },
          ].map(({ key, title, color, values, axisLabel, format }) => {
            if (values.length === 0) {
              return (
                <Card key={key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                      {t.noData}
                    </div>
                  </CardContent>
                </Card>
              );
            }
            const buckets = buildHistogram(values, 50);
            const clipped = values.filter((v) => v > buckets.at(-1)!.max).length;
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {title}{' '}
                    <span className="text-muted-foreground font-normal">
                      (N={values.length.toLocaleString()})
                    </span>
                  </CardTitle>
                  <p className="text-3xs font-mono text-subtle mt-0.5">
                    {t.binsClip(buckets.length, clipped > 0 ? clipped.toLocaleString() : '')}
                  </p>
                </CardHeader>
                <CardContent>
                  <Histogram
                    buckets={buckets}
                    color={color}
                    values={values}
                    axisLabel={axisLabel}
                    format={format}
                    title={title}
                    exportFilename={`${key}-distribution.png`}
                    yAxisLabel={t.sessions}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
