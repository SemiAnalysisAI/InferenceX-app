'use client';

import { Suspense, useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import type { Harness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { harnessLabel } from '@/lib/agentic-workload-explorer/harness-label';
import type {
  HarnessBucket,
  HarnessProfile,
  HarnessSessions,
  HarnessShare,
  SessionMetric,
} from '@semianalysisai/inferencex-db/proxytrace/harnesses';
import { Card, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartActions, Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  appendTraceVersion,
  useTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  bucketQuantile,
  HARNESS_COLORS,
  presentHarnesses,
} from '@/lib/agentic-workload-explorer/harness-profile';
import { formatAxisNumber } from '@/components/agentic-workload-explorer/trends-charts';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { useScrollFade } from '@/hooks/useScrollFade';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { CURSOR_LINE_PROPS } from '@/lib/d3-chart/cursor';
import { chartFont, measureTextWidth, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';

const STRINGS = {
  en: {
    summary: 'Summary',
    summaryDetail: 'Prompt tokens = input + cache read + cache write',
    failedToLoad: 'Failed to load harness data',
    noData: 'No data',
    metric: 'Metric',
    calls: 'Calls',
    perSessionExact: 'Per session · exact',
    perRequestSample: (pct: number) => `Per request · ${pct}% sample`,
    sessions: 'Sessions',
    requestsPerSessionP50: 'Requests / session p50',
    requestsPerSessionP90: 'Requests / session p90',
    promptTokensPerSessionP50: 'Prompt tokens / session p50',
    promptTokensPerSessionP90: 'Prompt tokens / session p90',
    outputTokensPerSessionP50: 'Output tokens / session p50',
    outputTokensPerSessionP90: 'Output tokens / session p90',
    promptTokensPerRequestP50: 'Prompt tokens / request p50',
    outputTokensPerRequestP50: 'Output tokens / request p50',
    promptTokensFromCacheRead: 'Prompt tokens from cache read',
    promptTokensFromCacheWrite: 'Prompt tokens from cache write',
    promptTokensUncached: 'Prompt tokens uncached',
    sampledRequests: 'Sampled requests',
    mainAgentRequests: 'Main-agent requests',
    toolCallsPerRequest: 'Tool calls / request',
    promptTokensPerToolCall: 'Prompt tokens / tool call',
    outputTokensPerToolCall: 'Output tokens / tool call',
    promptTokensP50MainAgent: 'Prompt tokens p50 (main agent)',
    promptTokensP95MainAgent: 'Prompt tokens p95 (main agent)',
    outputTokensP50: 'Output tokens p50',
    outputTokensP95: 'Output tokens p95',
    responsesLt20OutputTokens: 'Responses < 20 output tokens',
    promptTokensPerSession: 'Prompt tokens per session',
    outputTokensPerSession: 'Output tokens per session',
    requestsPerSession: 'Requests per session',
    promptTokensPerRequestSessionMean: 'Prompt tokens per request, session mean',
    promptTokensPerMainAgentRequest: 'Prompt tokens per main-agent request',
    outputTokensPerResponse: 'Output tokens per response',
    toolCallsPerMainAgentResponse: 'Tool calls per main-agent response',
    sessionDetail: (count: string) => `Share of sessions · ${count} sessions · exact`,
    sampleDetail: (pct: number, count: string) => `${pct}% block sample · ${count} requests`,
    shareOfRequests: (detail: string) => `Share of requests · ${detail}`,
    shareOfRequestsExcluding: (detail: string) =>
      `Share of requests · ${detail} · excludes 0-token responses`,
    axisPromptTokens: 'Prompt tokens (log)',
    axisOutputTokens: 'Output tokens (log)',
    axisRequests: 'Requests (log)',
    axisPromptPerRequest: 'Session prompt tokens ÷ requests (log)',
  },
  zh: {
    summary: '摘要',
    summaryDetail: 'Prompt token 数 = input + cache read + cache write',
    failedToLoad: '加载 harness 数据失败',
    noData: '暂无数据',
    metric: '指标',
    calls: '调用数',
    perSessionExact: '每会话 · 精确值',
    perRequestSample: (pct: number) => `每请求 · ${pct}% 采样`,
    sessions: '会话数',
    requestsPerSessionP50: '请求数 / 会话 p50',
    requestsPerSessionP90: '请求数 / 会话 p90',
    promptTokensPerSessionP50: 'Prompt token 数 / 会话 p50',
    promptTokensPerSessionP90: 'Prompt token 数 / 会话 p90',
    outputTokensPerSessionP50: 'Output token 数 / 会话 p50',
    outputTokensPerSessionP90: 'Output token 数 / 会话 p90',
    promptTokensPerRequestP50: 'Prompt token 数 / 请求 p50',
    outputTokensPerRequestP50: 'Output token 数 / 请求 p50',
    promptTokensFromCacheRead: '来自缓存读取的 prompt token 数',
    promptTokensFromCacheWrite: '来自缓存写入的 prompt token 数',
    promptTokensUncached: '未缓存的 prompt token 数',
    sampledRequests: '采样请求数',
    mainAgentRequests: '主智能体请求数',
    toolCallsPerRequest: '工具调用 / 请求',
    promptTokensPerToolCall: 'Prompt token 数 / 工具调用',
    outputTokensPerToolCall: 'Output token 数 / 工具调用',
    promptTokensP50MainAgent: 'Prompt token 数 p50（主智能体）',
    promptTokensP95MainAgent: 'Prompt token 数 p95（主智能体）',
    outputTokensP50: 'Output token 数 p50',
    outputTokensP95: 'Output token 数 p95',
    responsesLt20OutputTokens: '< 20 output token 的响应',
    promptTokensPerSession: '每会话 Prompt Token 数',
    outputTokensPerSession: '每会话 Output Token 数',
    requestsPerSession: '每会话请求数',
    promptTokensPerRequestSessionMean: '每请求 Prompt Token 数（会话均值）',
    promptTokensPerMainAgentRequest: '每主智能体请求 Prompt Token 数',
    outputTokensPerResponse: '每响应 Output Token 数',
    toolCallsPerMainAgentResponse: '每主智能体响应工具调用数',
    sessionDetail: (count: string) => `会话占比 · ${count} 个会话 · 精确值`,
    sampleDetail: (pct: number, count: string) => `${pct}% 块采样 · ${count} 个请求`,
    shareOfRequests: (detail: string) => `请求占比 · ${detail}`,
    shareOfRequestsExcluding: (detail: string) => `请求占比 · ${detail} · 排除 0 token 响应`,
    axisPromptTokens: 'Prompt token 数（对数轴）',
    axisOutputTokens: 'Output token 数（对数轴）',
    axisRequests: '请求数（对数轴）',
    axisPromptPerRequest: '会话 prompt token 数 ÷ 请求数（对数轴）',
  },
};

const PER_DECADE = 10;
const SESSION_METRIC_PER_DECADE: Record<SessionMetric, number> = {
  prompt: PER_DECADE,
  output: PER_DECADE,
  requests: 5,
  promptPerRequest: PER_DECADE,
};

const ROW_H = 30;
const MARGIN = { top: 6, bottom: 36 };
const TICK_GAP = 8;

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

function byHarness<T extends { harness: Harness }>(rows: T[]): Map<Harness, T[]> {
  const map = new Map<Harness, T[]>();
  for (const row of rows) {
    const list = map.get(row.harness);
    if (list) list.push(row);
    else map.set(row.harness, [row]);
  }
  return map;
}

function ChartFrame({
  title,
  detail,
  fileName,
  onExportPng,
  children,
}: {
  title: string;
  detail: string;
  fileName: string;
  onExportPng: () => void;
  children: ReactNode;
}) {
  return (
    <Expandable title={title} subtitle={detail}>
      <Card>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0 grow basis-48">
            <CardTitle>{title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          </div>
          <ChartActions fileName={fileName} onExportPng={onExportPng} />
        </div>
        {children}
      </Card>
    </Expandable>
  );
}

function AxisText({
  x,
  y,
  anchor = 'middle',
  size = CHART_TYPE.annotation,
  children,
}: {
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  children: ReactNode;
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} className="fill-muted-foreground">
      {children}
    </text>
  );
}

function GridLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--chart-grid)"
      strokeWidth={1}
      shapeRendering="crispEdges"
    />
  );
}

const TH = 'px-2 py-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap';
const TD = 'px-2 py-1.5 text-xs tabular-nums whitespace-nowrap';

function ScrollTable({ children }: { children: ReactNode }) {
  const { ref, fade, onScroll } = useScrollFade<HTMLDivElement>();
  return (
    <div className="relative rounded-xl border border-border/30 bg-card">
      <div ref={ref} onScroll={onScroll} className="overflow-x-auto rounded-xl">
        {children}
      </div>
      {fade && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-linear-to-l from-card to-transparent"
        />
      )}
    </div>
  );
}

function HarnessHead({ harness }: { harness: Harness }) {
  const locale = useLocale();
  return (
    <th className={`${TH} text-right`}>
      <span
        className="mr-1.5 inline-block size-1.5 rounded-[1px] align-middle"
        style={{ backgroundColor: HARNESS_COLORS[harness] }}
      />
      {harnessLabel(harness, locale)}
    </th>
  );
}

function tableNumber(v: number): string {
  return formatNumber(Math.round(v));
}

function tokens(v: number | undefined): string {
  return v === undefined ? '—' : tableNumber(v);
}

function ratio(num = 0, den = 0): string {
  return den > 0 ? tableNumber(num / den) : '—';
}

interface SummaryRow {
  label: string;
  value: (h: Harness) => string;
}

const quantileOf = (rows: HarnessBucket[] | undefined, p: number) => {
  const v = rows ? bucketQuantile(rows, PER_DECADE, p) : null;
  return v === null ? '—' : tableNumber(v);
};

const shareText = (num = 0, den = 0, digits = 1) => (den > 0 ? pct(num / den, digits) : '—');

function SummaryTable({
  data,
  strings,
}: {
  data: HarnessProfile;
  strings: (typeof STRINGS)['en'];
}) {
  const harnesses = presentHarnesses([...data.sessions, ...data.totals]);
  const context = byHarness(data.contextBuckets);
  const output = byHarness(data.outputBuckets);
  const sess = (h: Harness) => data.sessions.find((s) => s.harness === h);
  const total = (h: Harness) => data.totals.find((tt) => tt.harness === h);
  const sessionTokens = (key: keyof Omit<HarnessSessions, 'harness'>) => (h: Harness) =>
    tokens(sess(h)?.[key]);

  const prompt = (h: Harness) => {
    const s = sess(h);
    return s ? s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens : 0;
  };

  const groups: { label: string; rows: SummaryRow[] }[] = [
    {
      label: strings.perSessionExact,
      rows: [
        { label: strings.sessions, value: (h) => formatNumber(sess(h)?.sessions ?? 0) },
        { label: strings.requestsPerSessionP50, value: sessionTokens('requestsP50') },
        { label: strings.requestsPerSessionP90, value: sessionTokens('requestsP90') },
        { label: strings.promptTokensPerSessionP50, value: sessionTokens('promptP50') },
        { label: strings.promptTokensPerSessionP90, value: sessionTokens('promptP90') },
        { label: strings.outputTokensPerSessionP50, value: sessionTokens('outputP50') },
        { label: strings.outputTokensPerSessionP90, value: sessionTokens('outputP90') },
        { label: strings.promptTokensPerRequestP50, value: sessionTokens('promptPerRequestP50') },
        { label: strings.outputTokensPerRequestP50, value: sessionTokens('outputPerRequestP50') },
        {
          label: strings.promptTokensFromCacheRead,
          value: (h) => shareText(sess(h)?.cacheReadTokens, prompt(h)),
        },
        {
          label: strings.promptTokensFromCacheWrite,
          value: (h) => shareText(sess(h)?.cacheWriteTokens, prompt(h)),
        },
        {
          label: strings.promptTokensUncached,
          value: (h) => shareText(sess(h)?.inputTokens, prompt(h)),
        },
      ],
    },
    {
      label: strings.perRequestSample(data.samplePercent),
      rows: [
        { label: strings.sampledRequests, value: (h) => formatNumber(total(h)?.requests ?? 0) },
        {
          label: strings.mainAgentRequests,
          value: (h) => shareText(total(h)?.mainRequests, total(h)?.requests),
        },
        {
          label: strings.toolCallsPerRequest,
          value: (h) => {
            const tt = total(h);
            return tt && tt.requests > 0 ? (tt.toolCalls / tt.requests).toFixed(2) : '—';
          },
        },
        {
          label: strings.promptTokensPerToolCall,
          value: (h) => ratio(total(h)?.promptTokens, total(h)?.toolCalls),
        },
        {
          label: strings.outputTokensPerToolCall,
          value: (h) => ratio(total(h)?.outputTokens, total(h)?.toolCalls),
        },
        { label: strings.promptTokensP50MainAgent, value: (h) => quantileOf(context.get(h), 0.5) },
        { label: strings.promptTokensP95MainAgent, value: (h) => quantileOf(context.get(h), 0.95) },
        { label: strings.outputTokensP50, value: (h) => quantileOf(output.get(h), 0.5) },
        { label: strings.outputTokensP95, value: (h) => quantileOf(output.get(h), 0.95) },
        {
          label: strings.responsesLt20OutputTokens,
          value: (h) => {
            const out = output.get(h) ?? [];
            const all = out.reduce((sum, r) => sum + r.count, 0);
            const small = out.filter((r) => r.bucket < 13).reduce((sum, r) => sum + r.count, 0);
            return shareText(small, all);
          },
        },
      ],
    },
  ];

  return (
    <ScrollTable>
      <table className="w-full">
        <thead className="border-b border-border/20">
          <tr>
            <th className={`${TH} text-left`}>{strings.metric}</th>
            {harnesses.map((h) => (
              <HarnessHead key={h} harness={h} />
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.label} className="divide-y divide-border/20 border-b border-border/20">
            <tr>
              <td
                colSpan={harnesses.length + 1}
                className="px-2 pt-3 pb-1.5 text-left text-xs font-medium whitespace-nowrap text-foreground"
              >
                {group.label}
              </td>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label}>
                <td className={`${TD} text-left text-muted-foreground`}>{row.label}</td>
                {harnesses.map((h) => (
                  <td key={h} className={`${TD} text-right`}>
                    {row.value(h)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </ScrollTable>
  );
}

const CALL_ORDER = ['0', '1', '2', '3', '4+'];

function ToolCallsTable({ shares, callsLabel }: { shares: HarnessShare[]; callsLabel: string }) {
  const grouped = byHarness(shares);
  const harnesses = presentHarnesses(shares);
  const n = (h: Harness) => (grouped.get(h) ?? []).reduce((sum, r) => sum + r.count, 0);
  const cell = (h: Harness, key: string) => {
    const count = grouped.get(h)?.find((r) => r.key === key)?.count ?? 0;
    return n(h) > 0 ? pct(count / n(h), 1) : '—';
  };

  return (
    <ScrollTable>
      <table className="w-full">
        <thead className="border-b border-border/20">
          <tr>
            <th className={`${TH} text-left`}>{callsLabel}</th>
            {harnesses.map((h) => (
              <HarnessHead key={h} harness={h} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {CALL_ORDER.map((key) => (
            <tr key={key}>
              <td className={`${TD} text-left`}>{key}</td>
              {harnesses.map((h) => (
                <td key={h} className={`${TD} text-right`}>
                  {cell(h, key)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className={`${TD} text-left text-muted-foreground`}>n</td>
            {harnesses.map((h) => (
              <td key={h} className={`${TD} text-right text-muted-foreground`}>
                {formatNumber(n(h))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </ScrollTable>
  );
}

function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
    ticks.push(10 ** d);
    if (hi - lo <= 4 && d + Math.log10(3) <= hi) ticks.push(3 * 10 ** d);
  }
  return ticks;
}

function labelledTicks(ticks: number[], fits: (labels: number[]) => boolean): number[] {
  if (fits(ticks)) return ticks;
  const decades = ticks.filter((t) => 10 ** Math.round(Math.log10(t)) === t);
  for (let step = 1; step < decades.length; step++) {
    const thinned = decades.filter((_, i) => i % step === 0);
    if (fits(thinned)) return thinned;
  }
  return decades.slice(0, 1);
}

function HarnessHistogram({
  buckets,
  perDecade,
  title,
  detail,
  axisLabel,
  filename,
  noDataLabel,
}: {
  buckets: HarnessBucket[];
  perDecade: number;
  title: string;
  detail: string;
  axisLabel: string;
  filename: string;
  noDataLabel: string;
}) {
  const locale = useLocale();
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  const [hover, setHover] = useState<{ bucket: number; x: number; y: number } | null>(null);
  useFontsVersion();

  const ridge = useMemo(() => {
    const positive = buckets.filter((b) => b.bucket >= 0);
    const harnesses = presentHarnesses(positive);
    const raw = byHarness(positive);
    const edge = (q: number) =>
      harnesses.map((h) => Math.log10(bucketQuantile(raw.get(h) ?? [], perDecade, q) ?? 1));
    const lo = Math.floor(Math.min(...edge(0.01)));
    const hi = Math.max(lo + 1, Math.ceil(Math.max(...edge(0.99))));
    const clamp = (b: number) => Math.min(Math.max(b, lo * perDecade), hi * perDecade - 1);
    const folded = new Map<string, HarnessBucket>();
    for (const b of positive) {
      const bucket = clamp(b.bucket);
      const key = `${b.harness}:${bucket}`;
      const prev = folded.get(key);
      folded.set(key, { harness: b.harness, bucket, count: (prev?.count ?? 0) + b.count });
    }
    const shown = [...folded.values()];
    const grouped = byHarness(shown);
    const totals = new Map(
      harnesses.map((h) => [h, (grouped.get(h) ?? []).reduce((sum, b) => sum + b.count, 0)]),
    );
    const medians = new Map(
      harnesses.map((h) => [h, bucketQuantile(raw.get(h) ?? [], perDecade, 0.5)]),
    );
    const maxShare = Math.max(...shown.map((b) => b.count / (totals.get(b.harness) || 1)), 0);
    return { harnesses, lo, hi, clamp, folded, grouped, totals, medians, maxShare };
  }, [buckets, perDecade]);

  const { harnesses, lo, hi, clamp, folded, grouped, totals, medians, maxShare } = ridge;
  const width = dimensions.width;
  let chart = null;
  if (width > 0 && harnesses.length > 0) {
    const font = chartFont(CHART_TYPE.annotation);
    const labels = harnesses.map((h) => harnessLabel(h, locale));
    const medianLabels = harnesses.map((h) => {
      const median = medians.get(h);
      return median === null || median === undefined ? '' : `p50 ${formatAxisNumber(median)}`;
    });
    const left = Math.ceil(Math.max(...labels.map((l) => measureTextWidth(l, font)))) + 12;
    const right =
      Math.ceil(Math.max(0, ...medianLabels.map((l) => measureTextWidth(l, font)))) + 12;
    const plotW = Math.max(40, width - left - right);
    const axisY = MARGIN.top + harnesses.length * ROW_H;
    const height = axisY + MARGIN.bottom;
    const sx = (log: number) => left + ((log - lo) / (hi - lo)) * plotW;
    const barMax = ROW_H - 8;
    const cursorX = hover ? sx((hover.bucket + 0.5) / perDecade) : 0;
    const ticks = logTicks(lo, hi);
    const tickWidth = (t: number) => measureTextWidth(formatAxisNumber(t), font);
    const tickLabels = labelledTicks(ticks, (candidates) =>
      candidates.every(
        (t, i) =>
          i === 0 ||
          sx(Math.log10(t)) - sx(Math.log10(candidates[i - 1])) >=
            (tickWidth(t) + tickWidth(candidates[i - 1])) / 2 + TICK_GAP,
      ),
    );
    const updateHover = (e: PointerEvent<SVGRectElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      const log = lo + ((e.clientX - box.left) / box.width) * (hi - lo);
      setHover({ bucket: clamp(Math.floor(log * perDecade)), x: e.clientX, y: e.clientY });
    };

    chart = (
      <>
        <svg width={width} height={height} role="img" aria-label={title} className="block">
          {ticks.map((t) => (
            <GridLine
              key={t}
              x1={sx(Math.log10(t))}
              y1={MARGIN.top}
              x2={sx(Math.log10(t))}
              y2={axisY}
            />
          ))}
          {tickLabels.map((t) => (
            <AxisText key={t} x={sx(Math.log10(t))} y={axisY + 14}>
              {formatAxisNumber(t)}
            </AxisText>
          ))}
          <AxisText x={left + plotW / 2} y={height - 4} size={CHART_TYPE.axisLabel}>
            {axisLabel}
          </AxisText>
          {harnesses.map((h, i) => {
            const base = MARGIN.top + (i + 1) * ROW_H - 2;
            const n = totals.get(h) ?? 0;
            const median = medians.get(h);
            return (
              <g key={h}>
                <AxisText x={left - 8} y={base - 4} anchor="end">
                  {labels[i]}
                </AxisText>
                <GridLine x1={left} x2={left + plotW} y1={base} y2={base} />
                {(grouped.get(h) ?? []).map((b) => {
                  const x0 = sx(b.bucket / perDecade);
                  const x1 = sx((b.bucket + 1) / perDecade);
                  const barH = maxShare > 0 ? (b.count / n / maxShare) * barMax : 0;
                  return (
                    <rect
                      key={b.bucket}
                      x={x0 + 0.25}
                      y={base - barH}
                      width={Math.max(0.5, x1 - x0 - 0.5)}
                      height={barH}
                      fill={HARNESS_COLORS[h]}
                      fillOpacity={hover === null || hover.bucket === b.bucket ? 0.85 : 0.55}
                    />
                  );
                })}
                {median !== null && median !== undefined && (
                  <line
                    x1={sx(Math.log10(median))}
                    x2={sx(Math.log10(median))}
                    y1={base - barMax - 2}
                    y2={base}
                    stroke="var(--foreground)"
                    strokeWidth={1}
                  />
                )}
                <AxisText x={left + plotW + 8} y={base - 4} anchor="start">
                  {medianLabels[i]}
                </AxisText>
              </g>
            );
          })}
          {hover && (
            <line
              x1={cursorX}
              x2={cursorX}
              y1={MARGIN.top}
              y2={axisY}
              {...CURSOR_LINE_PROPS}
              className="pointer-events-none"
            />
          )}
          <rect
            x={left}
            y={MARGIN.top}
            width={plotW}
            height={axisY - MARGIN.top}
            fill="transparent"
            onPointerMove={updateHover}
            onPointerDown={updateHover}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover && (
          <FloatingTooltip x={hover.x} y={hover.y}>
            <ChartHoverCardBody
              title={`${formatAxisNumber(10 ** (hover.bucket / perDecade))}–${formatAxisNumber(10 ** ((hover.bucket + 1) / perDecade))}`}
              metrics={harnesses.map((h, i) => {
                const count = folded.get(`${h}:${hover.bucket}`)?.count ?? 0;
                const n = totals.get(h) ?? 0;
                return {
                  value: n > 0 ? pct(count / n, 1) : '—',
                  label: `${labels[i]} · ${formatNumber(count)}`,
                  color: HARNESS_COLORS[h],
                };
              })}
            />
          </FloatingTooltip>
        )}
      </>
    );
  }

  return (
    <ChartFrame
      title={title}
      detail={detail}
      fileName={filename.replace(/\.png$/u, '')}
      onExportPng={() =>
        track('agentic_workload_harness_histogram_export', { title, file_name: filename })
      }
    >
      {harnesses.length === 0 ? (
        <EmptyState bare className="py-8">
          {noDataLabel}
        </EmptyState>
      ) : (
        <div ref={setContainerRef} className="w-full min-w-0">
          {chart}
        </div>
      )}
    </ChartFrame>
  );
}

export default function HarnessesPage() {
  return (
    <Suspense>
      <HarnessesPageContent />
    </Suspense>
  );
}

function HarnessesPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();
  const { data, loading, error } = useDashboardData<HarnessProfile>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/harnesses', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error('Failed to fetch harness data');
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const sampled = useMemo(
    () => data?.totals.reduce((sum, row) => sum + row.requests, 0) ?? 0,
    [data],
  );
  const sessionCount = useMemo(
    () => data?.sessions.reduce((sum, s) => sum + s.sessions, 0) ?? 0,
    [data],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return <EmptyState>{t.failedToLoad}</EmptyState>;
  }

  const metric = (m: SessionMetric) => data.sessionBuckets.filter((b) => b.metric === m);
  const sessionDetail = t.sessionDetail(formatNumber(sessionCount));
  const sampleDetail = t.sampleDetail(data.samplePercent, formatNumber(sampled));

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader label={t.summary} detail={t.summaryDetail} />
        <SummaryTable data={data} strings={t} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HarnessHistogram
          buckets={metric('prompt')}
          perDecade={SESSION_METRIC_PER_DECADE.prompt}
          title={t.promptTokensPerSession}
          detail={sessionDetail}
          axisLabel={t.axisPromptTokens}
          filename="harness-session-prompt-tokens.png"
          noDataLabel={t.noData}
        />
        <HarnessHistogram
          buckets={metric('output')}
          perDecade={SESSION_METRIC_PER_DECADE.output}
          title={t.outputTokensPerSession}
          detail={sessionDetail}
          axisLabel={t.axisOutputTokens}
          filename="harness-session-output-tokens.png"
          noDataLabel={t.noData}
        />
        <HarnessHistogram
          buckets={metric('requests')}
          perDecade={SESSION_METRIC_PER_DECADE.requests}
          title={t.requestsPerSession}
          detail={sessionDetail}
          axisLabel={t.axisRequests}
          filename="harness-session-requests.png"
          noDataLabel={t.noData}
        />
        <HarnessHistogram
          buckets={metric('promptPerRequest')}
          perDecade={SESSION_METRIC_PER_DECADE.promptPerRequest}
          title={t.promptTokensPerRequestSessionMean}
          detail={sessionDetail}
          axisLabel={t.axisPromptPerRequest}
          filename="harness-session-prompt-per-request.png"
          noDataLabel={t.noData}
        />
        <HarnessHistogram
          buckets={data.contextBuckets}
          perDecade={PER_DECADE}
          title={t.promptTokensPerMainAgentRequest}
          detail={t.shareOfRequests(sampleDetail)}
          axisLabel={t.axisPromptTokens}
          filename="harness-prompt-tokens.png"
          noDataLabel={t.noData}
        />
        <HarnessHistogram
          buckets={data.outputBuckets}
          perDecade={PER_DECADE}
          title={t.outputTokensPerResponse}
          detail={t.shareOfRequestsExcluding(sampleDetail)}
          axisLabel={t.axisOutputTokens}
          filename="harness-output-tokens.png"
          noDataLabel={t.noData}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHeader label={t.toolCallsPerMainAgentResponse} detail={sampleDetail} />
          <ToolCallsTable shares={data.toolCallsPerResponse} callsLabel={t.calls} />
        </div>
      </div>
    </div>
  );
}
