'use client';

import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import {
  HARNESS_LABELS,
  type Harness,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import type {
  HarnessBucket,
  HarnessProfile,
  HarnessSessions,
  HarnessShare,
  SessionMetric,
} from '@semianalysisai/inferencex-db/proxytrace/harnesses';
import { Skeleton } from '@/components/ui/skeleton';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  appendTraceVersion,
  useTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  bucketQuantile,
  HARNESS_COLORS,
  presentHarnesses,
} from '@/lib/agentic-workload-explorer/harness-profile';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

// ── i18n ────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    summary: 'Summary',
    summaryDetail: 'prompt tokens = input + cache read + cache write',
    failedToLoad: 'Failed to load harness data.',
    noData: 'No data.',
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
    promptTokensPerSession: 'Prompt Tokens per Session',
    outputTokensPerSession: 'Output Tokens per Session',
    requestsPerSession: 'Requests per Session',
    promptTokensPerRequestSessionMean: 'Prompt Tokens per Request, Session Mean',
    promptTokensPerMainAgentRequest: 'Prompt Tokens per Main-Agent Request',
    outputTokensPerResponse: 'Output Tokens per Response',
    toolCallsPerMainAgentResponse: 'Tool Calls per Main-Agent Response',
    sessionDetail: (count: string) => `share of sessions · ${count} sessions · exact`,
    sampleDetail: (pct: number, count: string) => `${pct}% block sample · ${count} requests`,
    shareOfRequests: (detail: string) => `share of requests · ${detail}`,
    shareOfRequestsExcluding: (detail: string) =>
      `share of requests · ${detail} · excludes 0-token responses`,
    axisPromptTokens: 'prompt tokens (log)',
    axisOutputTokens: 'output tokens (log)',
    axisRequests: 'requests (log)',
    axisPromptPerRequest: 'session prompt tokens ÷ requests (log)',
  },
  zh: {
    summary: '摘要',
    summaryDetail: 'prompt token 数 = input + cache read + cache write',
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
    axisPromptTokens: 'prompt token 数（对数轴）',
    axisOutputTokens: 'output token 数（对数轴）',
    axisRequests: '请求数（对数轴）',
    axisPromptPerRequest: '会话 prompt token 数 ÷ 请求数（对数轴）',
  },
};

// Mirror HARNESS_BUCKETS_PER_DECADE and SESSION_METRIC_PER_DECADE in packages/db/src/harnesses.ts.
const PER_DECADE = 10;
const SESSION_METRIC_PER_DECADE: Record<SessionMetric, number> = {
  prompt: PER_DECADE,
  output: PER_DECADE,
  requests: 5,
  promptPerRequest: PER_DECADE,
};

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';
const CHART_W = 480;
const ROW_H = 30;
const MARGIN = { top: 6, right: 58, bottom: 30, left: 62 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

function formatTokens(v: number): string {
  if (v >= 1e9) return `${Number((v / 1e9).toFixed(1))}B`;
  if (v >= 1e6) return `${Number((v / 1e6).toFixed(1))}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

function byHarness<T extends { harness: Harness }>(rows: T[]): Map<Harness, T[]> {
  const map = new Map<Harness, T[]>();
  for (const row of rows) {
    const list = map.get(row.harness);
    if (list) list.push(row);
    else map.set(row.harness, [row]);
  }
  return map;
}

// ── Layout pieces ────────────────────────────────────────────────

function SectionHeader({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
      {detail && <span className="text-3xs font-mono text-subtle">{detail}</span>}
    </div>
  );
}

/** Chart card in the house style: controls row, then the chart. */
function ChartFrame({
  title,
  detail,
  onExport,
  locale,
  children,
}: {
  title: string;
  detail: string;
  onExport: () => void;
  locale: 'en' | 'zh';
  children: ReactNode;
}) {
  return (
    <div>
      <SectionHeader label={title} detail={detail} />
      <Expandable title={title} subtitle={detail}>
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-end gap-2">
            <ExportPngButton locale={locale} onClick={onExport} />
          </div>
          {children}
        </div>
      </Expandable>
    </div>
  );
}

function AxisText({
  x,
  y,
  anchor = 'middle',
  children,
}: {
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="fill-muted-foreground"
      style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
    >
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
      stroke="currentColor"
      className="text-border"
      strokeWidth={0.5}
      strokeDasharray="3 3"
    />
  );
}

const TH =
  'px-2 py-1.5 text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground whitespace-nowrap';
const TD = 'px-2 py-1.5 text-2xs font-mono tabular-nums whitespace-nowrap';

function HarnessHead({ harness }: { harness: Harness }) {
  return (
    <th className={`${TH} text-right`}>
      <span
        className="mr-1.5 inline-block size-1.5 rounded-[1px] align-middle"
        style={{ backgroundColor: HARNESS_COLORS[harness] }}
      />
      {HARNESS_LABELS[harness]}
    </th>
  );
}

// ── Summary ──────────────────────────────────────────────────────

interface SummaryRow {
  label: string;
  value: (h: Harness) => string;
}

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
  const tokens = (v: number | undefined) => (v === undefined ? '—' : formatTokens(v));
  const sessionTokens = (key: keyof Omit<HarnessSessions, 'harness'>) => (h: Harness) =>
    tokens(sess(h)?.[key]);
  const q = (rows: HarnessBucket[] | undefined, p: number) => {
    const v = rows ? bucketQuantile(rows, PER_DECADE, p) : null;
    return v === null ? '—' : formatTokens(v);
  };
  const share = (num = 0, den = 0, digits = 1) => (den > 0 ? pct(num / den, digits) : '—');
  const ratio = (num = 0, den = 0) => (den > 0 ? formatTokens(num / den) : '—');
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
          value: (h) => share(sess(h)?.cacheReadTokens, prompt(h)),
        },
        {
          label: strings.promptTokensFromCacheWrite,
          value: (h) => share(sess(h)?.cacheWriteTokens, prompt(h)),
        },
        {
          label: strings.promptTokensUncached,
          value: (h) => share(sess(h)?.inputTokens, prompt(h)),
        },
      ],
    },
    {
      label: strings.perRequestSample(data.samplePercent),
      rows: [
        { label: strings.sampledRequests, value: (h) => formatNumber(total(h)?.requests ?? 0) },
        {
          label: strings.mainAgentRequests,
          value: (h) => share(total(h)?.mainRequests, total(h)?.requests),
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
        { label: strings.promptTokensP50MainAgent, value: (h) => q(context.get(h), 0.5) },
        { label: strings.promptTokensP95MainAgent, value: (h) => q(context.get(h), 0.95) },
        { label: strings.outputTokensP50, value: (h) => q(output.get(h), 0.5) },
        { label: strings.outputTokensP95, value: (h) => q(output.get(h), 0.95) },
        {
          // Bucket 13 starts at 10^1.3 ≈ 20 tokens; zero-token responses sit in bucket -1.
          label: strings.responsesLt20OutputTokens,
          value: (h) => {
            const out = output.get(h) ?? [];
            const all = out.reduce((sum, r) => sum + r.count, 0);
            const small = out.filter((r) => r.bucket < 13).reduce((sum, r) => sum + r.count, 0);
            return share(small, all);
          },
        },
      ],
    },
  ];

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr>
            <th className={`${TH} text-left`}>{strings.metric}</th>
            {harnesses.map((h) => (
              <HarnessHead key={h} harness={h} />
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.label} className="divide-y divide-border border-b border-border">
            <tr>
              <td colSpan={harnesses.length + 1} className={`${TH} text-left text-subtle`}>
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
    </div>
  );
}

// ── Tool calls per response ──────────────────────────────────────

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
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr>
            <th className={`${TH} text-left`}>{callsLabel}</th>
            {harnesses.map((h) => (
              <HarnessHead key={h} harness={h} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
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
    </div>
  );
}

// ── Histograms ───────────────────────────────────────────────────

/** Decade ticks, plus 3× ticks when the axis spans few decades. */
function logTicks(lo: number, hi: number): number[] {
  const ticks: number[] = [];
  for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
    ticks.push(10 ** d);
    if (hi - lo <= 4 && d + Math.log10(3) <= hi) ticks.push(3 * 10 ** d);
  }
  return ticks;
}

/**
 * One histogram row per harness on a shared log axis. Bar height is the share
 * of that harness's items in the bucket, on one scale across rows; the tick
 * marks the median.
 */
function HarnessHistogram({
  buckets,
  perDecade,
  title,
  detail,
  axisLabel,
  filename,
  noDataLabel,
  locale,
}: {
  buckets: HarnessBucket[];
  perDecade: number;
  title: string;
  detail: string;
  axisLabel: string;
  filename: string;
  noDataLabel: string;
  locale: 'en' | 'zh';
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const positive = buckets.filter((b) => b.bucket >= 0);
  const harnesses = presentHarnesses(positive);
  // Axis spans every harness's p1–p99, rounded out to whole decades; the tails
  // fold into the edge bars so each row still sums to 100%.
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
  const maxShare = Math.max(...shown.map((b) => b.count / (totals.get(b.harness) || 1)), 0);
  const height = MARGIN.top + harnesses.length * ROW_H + MARGIN.bottom;
  const axisY = MARGIN.top + harnesses.length * ROW_H;
  const sx = (log: number) => MARGIN.left + ((log - lo) / (hi - lo)) * PLOT_W;
  const barMax = ROW_H - 8;

  return (
    <ChartFrame
      title={title}
      detail={detail}
      locale={locale}
      onExport={() => {
        track('agentic_workload_harness_histogram_export', { title, filename });
        if (svgRef.current)
          exportSvgToPng(svgRef.current, {
            title,
            subtitle: detail,
            filename,
            svgWidth: CHART_W,
            svgHeight: height,
          });
      }}
    >
      {harnesses.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-muted-foreground">
          {noDataLabel}
        </div>
      ) : (
        <svg ref={svgRef} viewBox={`0 0 ${CHART_W} ${height}`} className="w-full">
          {logTicks(lo, hi).map((t) => (
            <g key={t}>
              <GridLine x1={sx(Math.log10(t))} y1={MARGIN.top} x2={sx(Math.log10(t))} y2={axisY} />
              <AxisText x={sx(Math.log10(t))} y={axisY + 12}>
                {formatTokens(t)}
              </AxisText>
            </g>
          ))}
          <AxisText x={MARGIN.left + PLOT_W / 2} y={height - 4}>
            {axisLabel}
          </AxisText>
          {harnesses.map((h, i) => {
            const base = MARGIN.top + (i + 1) * ROW_H - 2;
            const rows = grouped.get(h) ?? [];
            const n = totals.get(h) ?? 0;
            const median = bucketQuantile(raw.get(h) ?? [], perDecade, 0.5);
            return (
              <g key={h}>
                <AxisText x={MARGIN.left - 6} y={base - 4} anchor="end">
                  {HARNESS_LABELS[h]}
                </AxisText>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + PLOT_W}
                  y1={base}
                  y2={base}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                />
                {rows.map((b) => {
                  const x0 = sx(b.bucket / perDecade);
                  const x1 = sx((b.bucket + 1) / perDecade);
                  const share = b.count / n;
                  const barH = maxShare > 0 ? (share / maxShare) * barMax : 0;
                  return (
                    <rect
                      key={b.bucket}
                      x={x0 + 0.25}
                      y={base - barH}
                      width={Math.max(0.5, x1 - x0 - 0.5)}
                      height={barH}
                      fill={HARNESS_COLORS[h]}
                      fillOpacity={0.85}
                    >
                      <title>
                        {HARNESS_LABELS[h]} · {formatTokens(10 ** (b.bucket / perDecade))}–
                        {formatTokens(10 ** ((b.bucket + 1) / perDecade))}: {pct(share, 1)} (
                        {formatNumber(b.count)})
                      </title>
                    </rect>
                  );
                })}
                {median !== null && (
                  <line
                    x1={sx(Math.log10(median))}
                    x2={sx(Math.log10(median))}
                    y1={base - barMax - 2}
                    y2={base}
                    stroke="currentColor"
                    className="text-foreground"
                    strokeWidth={1}
                  />
                )}
                <AxisText x={MARGIN.left + PLOT_W + 6} y={base - 4} anchor="start">
                  {median === null ? '' : `p50 ${formatTokens(median)}`}
                </AxisText>
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
}

// ── Page ─────────────────────────────────────────────────────────

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
        <Skeleton className="h-64 w-full rounded-md" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="py-8 text-center text-sm font-mono text-muted-foreground">
        {t.failedToLoad}
      </div>
    );
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
          locale={locale}
        />
        <HarnessHistogram
          buckets={metric('output')}
          perDecade={SESSION_METRIC_PER_DECADE.output}
          title={t.outputTokensPerSession}
          detail={sessionDetail}
          axisLabel={t.axisOutputTokens}
          filename="harness-session-output-tokens.png"
          noDataLabel={t.noData}
          locale={locale}
        />
        <HarnessHistogram
          buckets={metric('requests')}
          perDecade={SESSION_METRIC_PER_DECADE.requests}
          title={t.requestsPerSession}
          detail={sessionDetail}
          axisLabel={t.axisRequests}
          filename="harness-session-requests.png"
          noDataLabel={t.noData}
          locale={locale}
        />
        <HarnessHistogram
          buckets={metric('promptPerRequest')}
          perDecade={SESSION_METRIC_PER_DECADE.promptPerRequest}
          title={t.promptTokensPerRequestSessionMean}
          detail={sessionDetail}
          axisLabel={t.axisPromptPerRequest}
          filename="harness-session-prompt-per-request.png"
          noDataLabel={t.noData}
          locale={locale}
        />
        <HarnessHistogram
          buckets={data.contextBuckets}
          perDecade={PER_DECADE}
          title={t.promptTokensPerMainAgentRequest}
          detail={t.shareOfRequests(sampleDetail)}
          axisLabel={t.axisPromptTokens}
          filename="harness-prompt-tokens.png"
          noDataLabel={t.noData}
          locale={locale}
        />
        <HarnessHistogram
          buckets={data.outputBuckets}
          perDecade={PER_DECADE}
          title={t.outputTokensPerResponse}
          detail={t.shareOfRequestsExcluding(sampleDetail)}
          axisLabel={t.axisOutputTokens}
          filename="harness-output-tokens.png"
          noDataLabel={t.noData}
          locale={locale}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeader label={t.toolCallsPerMainAgentResponse} detail={sampleDetail} />
          <ToolCallsTable shares={data.toolCallsPerResponse} callsLabel={t.calls} />
        </div>
      </div>
    </div>
  );
}
