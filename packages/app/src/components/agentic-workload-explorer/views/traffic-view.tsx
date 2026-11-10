'use client';

import { Suspense, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type { TrafficData, TrafficHeatmapCell } from '@/lib/agentic-workload-explorer/api-types';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import {
  formatAxisNumber,
  formatHourLabel,
  TrendsStackedChart,
} from '@/components/agentic-workload-explorer/trends-charts';
import { HideSmallToggle } from '@/components/agentic-workload-explorer/hide-small-toggle';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { chartFont, measureTextWidth, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  CHART_COLORS,
  NEUTRAL_SERIES_COLOR,
} from '@/components/agentic-workload-explorer/series-colors';

const STRINGS = {
  en: {
    yRequests: 'Requests',
    trafficOverview: 'Traffic overview',
    failedToLoad: 'Failed to load traffic data',
    totalRequests: 'Total requests',
    peakHour: 'Peak hour',
    avgRequestsPerDay: 'Avg requests / day',
    requestsOverTime: 'Requests over time',
    requests: 'requests',
    hourlyHeatmap: 'Hourly heatmap',
    heatmapDetail: 'Requests by day of week and hour',
    streamingVsNonStreaming: 'Streaming vs non-streaming',
    finalDays: (n: number) => `Final ${n} days`,
    noDaily: 'No daily request data available',
    noHeatmap: 'No heatmap data available',
    noStreaming: 'No streaming breakdown data available',
    dayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as readonly string[],
    streaming: 'Streaming',
    nonStreaming: 'Non-streaming',
    hiddenCells: 'Under 5 requests, hidden',
    hourOfDay: 'Hour of day',
    scaleTitle: 'Requests per hour',
    requestsLabel: 'Requests',
    dailyRequests: 'Daily requests',
  },
  zh: {
    yRequests: '请求数',
    trafficOverview: '流量概览',
    failedToLoad: '无法加载流量数据',
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
    hiddenCells: '少于 5 个请求，已隐藏',
    hourOfDay: '小时',
    scaleTitle: '每小时请求数',
    requestsLabel: '请求数',
    dailyRequests: '每日请求',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

const DAILY_KEYS = ['requests'];
const STREAMING_KEYS = ['streaming', 'nonStreaming'];
const STREAMING_COLORS: Record<string, string> = {
  streaming: CHART_COLORS[0],
  nonStreaming: NEUTRAL_SERIES_COLOR,
};
const streamingColor = (key: string) => STREAMING_COLORS[key];
const dailyColor = () => CHART_COLORS[0];

const HEATMAP_MARGIN = { top: 4, right: 8, bottom: 36, left: 44 };
const HEATMAP_ROW_H = 24;
const HEATMAP_HEIGHT = HEATMAP_MARGIN.top + HEATMAP_ROW_H * 7 + HEATMAP_MARGIN.bottom;
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, h) => h);
const HEATMAP_TICK_STEPS = [3, 6, 12];
const HEATMAP_TICK_GAP = 8;
const HIDE_SMALL_THRESHOLD = 5;
const HEATMAP_COLOR = CHART_COLORS[0];

function heatmapOpacity(intensity: number): number {
  return 0.08 + intensity * 0.92;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

interface HeatmapHover {
  dow: number;
  hour: number;
  count: number;
  x: number;
  y: number;
}

function HourlyHeatmap({ heatmap, t }: { heatmap: TrafficHeatmapCell[]; t: Strings }) {
  const [hideSmall, setHideSmall] = useState(true);
  const [hovered, setHovered] = useState<HeatmapHover | null>(null);
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: HEATMAP_HEIGHT });
  useFontsVersion();

  const { lookup, maxCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let max = 1;
    for (const c of heatmap) {
      counts.set(`${c.dayOfWeek}-${c.hourOfDay}`, c.requestCount);
      if ((!hideSmall || c.requestCount >= HIDE_SMALL_THRESHOLD) && c.requestCount > max) {
        max = c.requestCount;
      }
    }
    return { lookup: counts, maxCount: max };
  }, [heatmap, hideSmall]);

  if (heatmap.length === 0) {
    return (
      <Card>
        <EmptyState bare className="py-8">
          {t.noHeatmap}
        </EmptyState>
      </Card>
    );
  }

  const plotW = Math.max(0, dimensions.width - HEATMAP_MARGIN.left - HEATMAP_MARGIN.right);
  const cellW = plotW / 24;
  const plotBottom = HEATMAP_MARGIN.top + HEATMAP_ROW_H * 7;
  const tickFont = chartFont(CHART_TYPE.annotation);
  const tickWidth = Math.max(
    ...HEATMAP_HOURS.map((h) => measureTextWidth(formatHour(h), tickFont)),
  );
  const tickStep =
    HEATMAP_TICK_STEPS.find((step) => step * cellW >= tickWidth + HEATMAP_TICK_GAP) ?? 24;

  return (
    <ExpandableChart
      title={t.hourlyHeatmap}
      subtitle={t.heatmapDetail}
      actions={
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <HideSmallToggle
            threshold={HIDE_SMALL_THRESHOLD}
            pressed={hideSmall}
            onPressedChange={(enabled) => {
              setHideSmall(enabled);
              track('agentic_workload_traffic_heatmap_toggle', { enabled });
            }}
          />
          <ChartActions
            fileName="request-heatmap"
            onExportPng={() => track('agentic_workload_export_png', { chart: 'request-heatmap' })}
          />
        </div>
      }
    >
      <div ref={setContainerRef} className="w-full min-w-0">
        {dimensions.width > 0 && (
          <svg
            width={dimensions.width}
            height={dimensions.height}
            role="img"
            aria-label={`${t.hourlyHeatmap}, ${t.heatmapDetail}`}
            fontFamily={CHART_FONT_SANS}
            onMouseLeave={() => setHovered(null)}
          >
            {t.dayLabels.map((label, dow) => (
              <text
                key={`row-${dow}`}
                x={HEATMAP_MARGIN.left - 8}
                y={HEATMAP_MARGIN.top + dow * HEATMAP_ROW_H + HEATMAP_ROW_H / 2}
                dominantBaseline="central"
                textAnchor="end"
                fontSize={px(CHART_TYPE.annotation)}
                className="fill-muted-foreground"
              >
                {label}
              </text>
            ))}
            {HEATMAP_HOURS.filter((h) => h % tickStep === 0).map((h) => (
              <text
                key={`col-${h}`}
                x={HEATMAP_MARGIN.left + h * cellW + cellW / 2}
                y={plotBottom + 14}
                textAnchor="middle"
                fontSize={px(CHART_TYPE.annotation)}
                className="fill-muted-foreground"
              >
                {formatHour(h)}
              </text>
            ))}
            <text
              x={HEATMAP_MARGIN.left + plotW / 2}
              y={plotBottom + 32}
              textAnchor="middle"
              fontSize={px(CHART_TYPE.axisLabel)}
              className="fill-muted-foreground"
            >
              {t.hourOfDay}
            </text>
            {t.dayLabels.map((_, dow) =>
              HEATMAP_HOURS.map((hour) => {
                const count = lookup.get(`${dow}-${hour}`) ?? 0;
                const hidden = hideSmall && count < HIDE_SMALL_THRESHOLD;
                const isHovered = hovered?.dow === dow && hovered.hour === hour;
                return (
                  <rect
                    key={`${dow}-${hour}`}
                    x={HEATMAP_MARGIN.left + hour * cellW + 0.5}
                    y={HEATMAP_MARGIN.top + dow * HEATMAP_ROW_H + 0.5}
                    width={Math.max(0, cellW - 2)}
                    height={HEATMAP_ROW_H - 2}
                    rx={2}
                    fill={hidden ? 'var(--muted)' : HEATMAP_COLOR}
                    fillOpacity={hidden ? 0.5 : heatmapOpacity(Math.min(1, count / maxCount))}
                    stroke={isHovered ? 'var(--foreground)' : 'none'}
                    strokeWidth={1.5}
                    onMouseMove={(e) =>
                      setHovered({ dow, hour, count, x: e.clientX, y: e.clientY })
                    }
                  />
                );
              }),
            )}
          </svg>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{t.scaleTitle}</span>
        <span className="tabular-nums">{formatAxisNumber(0)}</span>
        <span
          aria-hidden="true"
          className="h-2.5 w-32 rounded-sm"
          style={{
            backgroundImage: `linear-gradient(to right, color-mix(in oklab, ${HEATMAP_COLOR} ${heatmapOpacity(0) * 100}%, transparent), ${HEATMAP_COLOR})`,
          }}
        />
        <span className="tabular-nums">{formatAxisNumber(maxCount)}</span>
        {hideSmall && (
          <span className="ml-2 inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-muted" />
            {t.hiddenCells}
          </span>
        )}
      </div>
      {hovered && (
        <FloatingTooltip x={hovered.x} y={hovered.y}>
          <ChartHoverCardBody
            title={`${t.dayLabels[hovered.dow]} ${formatHour(hovered.hour)}`}
            metrics={[{ value: formatAxisNumber(hovered.count), label: t.requestsLabel }]}
            summary={hideSmall && hovered.count < HIDE_SMALL_THRESHOLD ? t.hiddenCells : undefined}
          />
        </FloatingTooltip>
      )}
    </ExpandableChart>
  );
}

export default function TrafficPage() {
  return (
    <Suspense>
      <TrafficPageContent />
    </Suspense>
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
  const { dailyDays, dailyTotal, streamingDays } = useMemo(() => {
    const days = data?.daily.slice(-DAY_RANGE_DAYS[range]) ?? [];
    return {
      dailyDays: days.map((d) => ({ day: d.day, values: { requests: d.requestCount } })),
      dailyTotal: days.reduce((sum, d) => sum + d.requestCount, 0),
      streamingDays: (data?.streamingBreakdown ?? []).slice(-30).map((d) => ({
        day: d.day,
        values: { streaming: d.streamingCount, nonStreaming: d.nonStreamingCount },
      })),
    };
  }, [data, range]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader label={t.trafficOverview} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <EmptyState>{t.failedToLoad}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat boxed label={t.totalRequests} value={formatNumber(data.stats.totalRequests)} />
            <Stat
              boxed
              label={t.peakHour}
              value={data.stats.peakHour ? formatHourLabel(data.stats.peakHour, locale) : '--'}
            />
            <Stat boxed label={t.avgRequestsPerDay} value={formatNumber(data.stats.avgPerDay)} />
          </dl>
        )}
      </div>

      {data && (
        <>
          <TrendsStackedChart
            title={t.requestsOverTime}
            subtext={`${formatNumber(dailyTotal)} ${t.requests}`}
            days={dailyDays}
            seriesKeys={DAILY_KEYS}
            labelFor={() => t.dailyRequests}
            colorFor={dailyColor}
            mode="count"
            yLabel={t.yRequests}
            filename="daily-requests"
            emptyLabel={t.noDaily}
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
          />

          <HourlyHeatmap heatmap={data.heatmap} t={t} />

          <TrendsStackedChart
            title={t.streamingVsNonStreaming}
            subtext={t.finalDays(Math.min(data.streamingBreakdown.length, 30))}
            days={streamingDays}
            seriesKeys={STREAMING_KEYS}
            labelFor={(key) => (key === 'streaming' ? t.streaming : t.nonStreaming)}
            colorFor={streamingColor}
            mode="count"
            yLabel={t.yRequests}
            filename="streaming-vs-non-streaming"
            emptyLabel={t.noStreaming}
          />
        </>
      )}
    </div>
  );
}
