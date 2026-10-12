'use client';

import { Suspense, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  TrafficData,
  TrafficHeatmapCell,
  DailyCount,
  StreamingDay,
} from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotDate } from '@/lib/agentic-workload-explorer/snapshot';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

// ── i18n ──────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    trafficOverview: 'Traffic Overview',
    failedToLoad: 'Failed to load traffic data.',
    totalRequests: 'Total Requests',
    peakHour: 'Peak Hour',
    avgRequestsPerDay: 'Avg Requests / Day',
    requestsOverTime: 'Requests Over Time',
    requests: 'requests',
    hourlyHeatmap: 'Hourly Heatmap',
    heatmapDetail: 'requests by day of week and hour',
    streamingVsNonStreaming: 'Streaming vs Non-Streaming',
    finalDays: (n: number) => `final ${n} days`,
    noDaily: 'No daily request data available',
    noHeatmap: 'No heatmap data available',
    noStreaming: 'No streaming breakdown data available',
    dayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as readonly string[],
    streaming: 'Streaming',
    nonStreaming: 'Non-Streaming',
    hideSmall: 'Hide n<5',
    exportDaily: 'Daily Requests',
    exportHeatmap: 'Request Heatmap',
    exportStreaming: 'Streaming vs Non-Streaming',
    tooltipStreaming: 'streaming',
    tooltipNonStreaming: 'non-streaming',
  },
  zh: {
    trafficOverview: '流量概览',
    failedToLoad: '无法加载流量数据。',
    totalRequests: '总请求数',
    peakHour: '峰值时段',
    avgRequestsPerDay: '日均请求数',
    requestsOverTime: '请求趋势',
    requests: '个请求',
    hourlyHeatmap: '每小时热力图',
    heatmapDetail: '按星期和小时统计请求',
    streamingVsNonStreaming: '流式与非流式',
    finalDays: (n: number) => `最后 ${n} 天`,
    noDaily: '无每日请求数据',
    noHeatmap: '无热力图数据',
    noStreaming: '无流式分布数据',
    dayLabels: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as readonly string[],
    streaming: '流式',
    nonStreaming: '非流式',
    hideSmall: '隐藏 n<5',
    exportDaily: '每日请求',
    exportHeatmap: '请求热力图',
    exportStreaming: '流式与非流式',
    tooltipStreaming: '流式',
    tooltipNonStreaming: '非流式',
  },
} as const;

// -- Chart constants --------------------------------------------------------

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 56 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

// -- Helpers ----------------------------------------------------------------

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

function formatPeakHour(peakHour: string | null): string {
  if (!peakHour) return '--';
  const h = parseInt(peakHour, 10);
  if (Number.isNaN(h)) return peakHour;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:00 ${suffix}`;
}

// -- Section header ---------------------------------------------------------

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

// -- Stat card --------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-mono font-bold mt-0.5">{value}</div>
    </div>
  );
}

// -- Requests Over Time bar chart -------------------------------------------

function DailyRequestsChart({
  data,
  controls,
  strings,
}: {
  data: DailyCount[];
  controls: ReactNode;
  strings: { noDaily: string; exportDaily: string; requests: string };
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const labelEvery = Math.ceil(data.length / 7);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {strings.noDaily}
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.requestCount), 1);
  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  const barGap = 2;
  const barWidth = Math.max(1, (PLOT_W - barGap * data.length) / data.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <Expandable title={strings.exportDaily}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          {controls}
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: strings.exportDaily,
                  filename: 'daily-requests.png',
                  svgWidth: CHART_W,
                  svgHeight: CHART_H,
                });
            }}
          />
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ maxHeight: 240 }}
        >
          {/* Y-axis grid lines and labels */}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              {t > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(t)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
              >
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {/* Baseline */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />

          {/* Bars */}
          {data.map((d, i) => {
            const x = MARGIN.left + i * (barWidth + barGap);
            const barH = (d.requestCount / yMax) * PLOT_H;
            return (
              <g key={d.day}>
                <rect
                  x={x}
                  y={sy(d.requestCount)}
                  width={barWidth}
                  height={Math.max(barH, 0.5)}
                  fill="#6366f1"
                  rx={1}
                >
                  <title>
                    {formatSnapshotDate(d.day)}: {formatNumber(d.requestCount)} {strings.requests}
                  </title>
                </rect>
                {i % labelEvery === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={MARGIN.top + PLOT_H + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
                  >
                    {formatSnapshotDate(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Expandable>
  );
}

// -- Hourly Heatmap ---------------------------------------------------------

function HourlyHeatmap({
  heatmap,
  strings,
}: {
  heatmap: TrafficHeatmapCell[];
  strings: {
    noHeatmap: string;
    hideSmall: string;
    exportHeatmap: string;
    dayLabels: readonly string[];
    requests: string;
  };
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hideSmall, setHideSmall] = useState(true);
  if (heatmap.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {strings.noHeatmap}
      </div>
    );
  }

  const maxCount = Math.max(
    ...heatmap.filter((c) => !hideSmall || c.requestCount >= 5).map((c) => c.requestCount),
    1,
  );

  // Build a lookup map: key = "dow-hour"
  const lookup = new Map<string, number>();
  for (const c of heatmap) {
    lookup.set(`${c.dayOfWeek}-${c.hourOfDay}`, c.requestCount);
  }

  const labelW = 32;
  const bottomH = 16;
  const gridW = 600 - labelW - 8;
  const gridH = 200 - bottomH - 4;
  const cellW = gridW / 24;
  const cellH = gridH / 7;

  return (
    <Expandable title={strings.exportHeatmap}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-end gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              setHideSmall((h) => !h);
              track('agentic_workload_traffic_heatmap_toggle', { hideSmall: !hideSmall });
            }}
            className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
              hideSmall
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            {strings.hideSmall}
          </button>
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: strings.exportHeatmap,
                  filename: 'request-heatmap.png',
                  svgWidth: 600,
                  svgHeight: 200,
                });
            }}
          />
        </div>
        <svg ref={svgRef} viewBox="0 0 600 200" className="w-full" style={{ maxHeight: 240 }}>
          {/* Row labels (day names) */}
          {strings.dayLabels.map((label, dow) => (
            <text
              key={`row-${dow}`}
              x={labelW - 4}
              y={4 + dow * cellH + cellH / 2 + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: '8px', fontFamily: SVG_FONT }}
            >
              {label}
            </text>
          ))}

          {/* Column labels (hours, every 4h) */}
          {Array.from({ length: 7 }, (_, i) => i * 4).map((h) => (
            <text
              key={`col-${h}`}
              x={labelW + h * cellW + cellW / 2}
              y={4 + 7 * cellH + 12}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: '8px', fontFamily: SVG_FONT }}
            >
              {h}
            </text>
          ))}

          {/* Grid cells */}
          {Array.from({ length: 7 }, (_row, dow) =>
            Array.from({ length: 24 }, (_col, hour) => {
              const count = lookup.get(`${dow}-${hour}`) || 0;
              if (hideSmall && count < 5) {
                return (
                  <rect
                    key={`${dow}-${hour}`}
                    x={labelW + hour * cellW}
                    y={4 + dow * cellH}
                    width={cellW - 1}
                    height={cellH - 1}
                    rx={2}
                    fill="transparent"
                  />
                );
              }
              const intensity = maxCount > 0 ? count / maxCount : 0;
              return (
                <rect
                  key={`${dow}-${hour}`}
                  x={labelW + hour * cellW}
                  y={4 + dow * cellH}
                  width={cellW - 1}
                  height={cellH - 1}
                  rx={2}
                  fill="#6366f1"
                  fillOpacity={intensity}
                >
                  <title>
                    {strings.dayLabels[dow]} {hour}:00 - {formatNumber(count)} {strings.requests}
                  </title>
                </rect>
              );
            }),
          )}
        </svg>
      </div>
    </Expandable>
  );
}

// -- Streaming vs Non-Streaming stacked bar chart ---------------------------

function StreamingChart({
  data,
  strings,
}: {
  data: StreamingDay[];
  strings: {
    noStreaming: string;
    exportStreaming: string;
    streaming: string;
    nonStreaming: string;
    tooltipStreaming: string;
    tooltipNonStreaming: string;
  };
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const sliced = data.slice(-30);
  if (sliced.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {strings.noStreaming}
      </div>
    );
  }

  const maxTotal = Math.max(...sliced.map((d) => d.streamingCount + d.nonStreamingCount), 1);
  const yTicks = generateTicks(0, maxTotal, 5);
  const yMax = yTicks.at(-1) || maxTotal;

  const barGap = 2;
  const barWidth = Math.max(1, (PLOT_W - barGap * sliced.length) / sliced.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-end mb-2">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current)
              exportSvgToPng(svgRef.current, {
                title: strings.exportStreaming,
                filename: 'streaming-vs-non-streaming.png',
                svgWidth: CHART_W,
                svgHeight: CHART_H,
              });
          }}
        />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ maxHeight: 240 }}
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            {t > 0 && (
              <line
                x1={MARGIN.left}
                y1={sy(t)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(t)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={MARGIN.left - 6}
              y={sy(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {formatNumber(t)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        {/* Stacked bars */}
        {sliced.map((d, i) => {
          const x = MARGIN.left + i * (barWidth + barGap);
          const total = d.streamingCount + d.nonStreamingCount;
          const streamH = (d.streamingCount / yMax) * PLOT_H;
          const nonStreamH = (d.nonStreamingCount / yMax) * PLOT_H;

          return (
            <g key={d.day}>
              {/* Non-streaming (bottom) */}
              <rect
                x={x}
                y={sy(total)}
                width={barWidth}
                height={Math.max(nonStreamH, total > 0 ? 0.5 : 0)}
                fill="#6b7280"
                rx={0}
              >
                <title>
                  {d.day}: {formatNumber(d.nonStreamingCount)} {strings.tooltipNonStreaming}
                </title>
              </rect>
              {/* Streaming (top of stack) */}
              <rect
                x={x}
                y={sy(total) + Math.max(nonStreamH, 0)}
                width={barWidth}
                height={Math.max(streamH, total > 0 ? 0.5 : 0)}
                fill="#06b6d4"
                rx={0}
              >
                <title>
                  {d.day}: {formatNumber(d.streamingCount)} {strings.tooltipStreaming}
                </title>
              </rect>
              {/* X-axis labels: show every 5th */}
              {i % 5 === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={MARGIN.top + PLOT_H + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
                >
                  {new Date(d.day).toLocaleDateString('en-US', {
                    timeZone: 'UTC',
                    month: 'short',
                    day: 'numeric',
                  })}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#06b6d4' }} />
          <span className="text-3xs font-mono text-muted-foreground">{strings.streaming}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#6b7280' }} />
          <span className="text-3xs font-mono text-muted-foreground">{strings.nonStreaming}</span>
        </div>
      </div>
    </div>
  );
}

// -- Main page --------------------------------------------------------------

export default function TrafficPage() {
  const locale = useLocale();
  const t = STRINGS[locale];
  return (
    <Expandable title={t.exportStreaming}>
      <Suspense>
        <TrafficPageContent />
      </Suspense>
    </Expandable>
  );
}

function TrafficPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<TrafficData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/traffic', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error('Failed to fetch traffic data');
      return r.json();
    },
    key: String(traceVersionParam),
  });
  const [range, setRange] = useState<DayRange>('30d');
  const days = data?.daily.slice(-DAY_RANGE_DAYS[range]) ?? [];

  return (
    <div className="space-y-6">
      {/* -- Stats --------------------------------------------------------- */}
      <div>
        <SectionHeader label={t.trafficOverview} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-surface p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.failedToLoad}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard label={t.totalRequests} value={formatNumber(data.stats.totalRequests)} />
            <StatCard label={t.peakHour} value={formatPeakHour(data.stats.peakHour)} />
            <StatCard label={t.avgRequestsPerDay} value={formatNumber(data.stats.avgPerDay)} />
          </div>
        )}
      </div>

      {data && (
        <>
          {/* -- Requests Over Time -------------------------------------------- */}
          <div>
            <SectionHeader
              label={t.requestsOverTime}
              detail={`${formatNumber(days.reduce((sum, d) => sum + d.requestCount, 0))} ${t.requests}`}
            />
            <DailyRequestsChart
              data={days}
              controls={
                <RangeToggle
                  value={range}
                  options={DAY_RANGES}
                  onChange={(v) => {
                    setRange(v);
                    track('agentic_workload_traffic_range_changed', { range: v });
                  }}
                />
              }
              strings={{
                noDaily: t.noDaily,
                exportDaily: t.exportDaily,
                requests: t.requests,
              }}
            />
          </div>

          {/* -- Hourly Heatmap ------------------------------------------------ */}
          <div>
            <SectionHeader label={t.hourlyHeatmap} detail={t.heatmapDetail} />
            <HourlyHeatmap
              heatmap={data.heatmap}
              strings={{
                noHeatmap: t.noHeatmap,
                hideSmall: t.hideSmall,
                exportHeatmap: t.exportHeatmap,
                dayLabels: t.dayLabels,
                requests: t.requests,
              }}
            />
          </div>

          {/* -- Streaming vs Non-Streaming ------------------------------------ */}
          <div>
            <SectionHeader
              label={t.streamingVsNonStreaming}
              detail={t.finalDays(Math.min(data.streamingBreakdown.length, 30))}
            />
            <StreamingChart
              data={data.streamingBreakdown}
              strings={{
                noStreaming: t.noStreaming,
                exportStreaming: t.exportStreaming,
                streaming: t.streaming,
                nonStreaming: t.nonStreaming,
                tooltipStreaming: t.tooltipStreaming,
                tooltipNonStreaming: t.tooltipNonStreaming,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
