'use client';

import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { formatHourLabel } from '@/components/agentic-workload-explorer/trends-charts';
import type { ErrorData } from '@/lib/agentic-workload-explorer/api-types';
import { ChartActions, Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { EmptyState } from '@/components/ui/empty-state';
import { CardTitle } from '@/components/ui/card';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { CURSOR_LINE_PROPS } from '@/lib/d3-chart/cursor';
import { chartFont, measureTextWidth, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';

type Severity = 'nominal' | 'watch' | 'elevated' | 'critical';

type RailPoint = ErrorData['timeline'][number] & {
  rate: number;
  baselineRate: number;
  deviationScore: number;
  severity: Severity;
  hasBaseline: boolean;
};

const TRAILING_HOURS = 24;
const CHART_HEIGHT = 244;
const LEFT = 66;
const RIGHT = 16;
const RATE_TOP = 14;
const RATE_HEIGHT = 120;
const VOLUME_TOP = 162;
const VOLUME_HEIGHT = 38;

const SEVERITY_META: Record<Severity, { fill: string; badge: string }> = {
  nominal: {
    fill: '#22c55e',
    badge: 'border-success/30 bg-success/10 text-success',
  },
  watch: {
    fill: '#f59e0b',
    badge: 'border-warning/30 bg-warning/10 text-warning',
  },
  elevated: {
    fill: '#f97316',
    badge: 'border-warning/50 bg-warning/20 text-warning',
  },
  critical: {
    fill: '#f43f5e',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
};

const STRINGS = {
  en: {
    title: 'Hourly incident signals',
    noSignals: 'No hourly error signals are available for this trace version.',
    baselineNote: (hours: number, anomalyCount: number) =>
      `Median + MAD baseline over the prior ${hours} hours · ${anomalyCount} anomalous ${anomalyCount === 1 ? 'hour' : 'hours'}`,
    exportLabel: 'Export hourly incident signal rail as PNG',
    exportTitle: 'Hourly incident signals',
    requests: 'requests',
    errorRate: 'Error rate',
    volume: 'Volume',
    trailingBaseline: 'Trailing baseline',
    errors: 'errors',
    learning: 'Learning',
    needs3Hours: 'needs 3 prior hours',
    ariaLabel:
      'Hourly incident signal rail. Use arrow keys to inspect hours, Home and End to jump, and Enter or Space to select.',
    trailingBaselineLabel: (rate: string) => `${rate} trailing baseline`,
    baselineLearning: 'baseline learning',
    accessibleLabel: (
      hour: string,
      severity: string,
      errorCount: number,
      totalCount: number,
      rate: string,
      baselineLabel: string,
    ) =>
      `${hour}: ${severity}, ${errorCount} errors across ${totalCount} requests, ${rate} error rate, ${baselineLabel}`,
    severity: {
      nominal: { label: 'Nominal', description: 'Within the trailing baseline' },
      watch: { label: 'Watch', description: 'Above the trailing baseline' },
      elevated: { label: 'Elevated', description: 'Materially above the trailing baseline' },
      critical: { label: 'Critical', description: 'Severely above the trailing baseline' },
    },
  },
  zh: {
    title: '逐小时事件信号',
    noSignals: '该 trace 版本暂无逐小时错误信号。',
    baselineNote: (hours: number, anomalyCount: number) =>
      `基于前 ${hours} 小时的中位数 + MAD 基线 · ${anomalyCount} 个异常小时`,
    exportLabel: '导出逐小时事件信号为 PNG',
    exportTitle: '逐小时事件信号',
    requests: '请求数',
    errorRate: '错误率',
    volume: '请求量',
    trailingBaseline: '滚动基线',
    errors: '个错误',
    learning: '学习中',
    needs3Hours: '需要 3 小时历史数据',
    ariaLabel: '逐小时事件信号。使用方向键检视各小时，Home/End 跳转，Enter 或空格选中。',
    trailingBaselineLabel: (rate: string) => `${rate} 滚动基线`,
    baselineLearning: '基线学习中',
    accessibleLabel: (
      hour: string,
      severity: string,
      errorCount: number,
      totalCount: number,
      rate: string,
      baselineLabel: string,
    ) =>
      `${hour}: ${severity}，${errorCount} 个错误 / ${totalCount} 个请求，错误率 ${rate}，${baselineLabel}`,
    severity: {
      nominal: { label: '正常', description: '在滚动基线范围内' },
      watch: { label: '关注', description: '高于滚动基线' },
      elevated: { label: '偏高', description: '明显高于滚动基线' },
      critical: { label: '严重', description: '远超滚动基线' },
    },
  },
};

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function getSeverity(
  point: ErrorData['timeline'][number],
  rate: number,
  baselineRate: number,
  deviationScore: number,
  hasBaseline: boolean,
): Severity {
  if (point.errorCount === 0 || rate <= baselineRate) return 'nominal';
  if (!hasBaseline) return 'watch';
  if (point.errorCount >= 3 && deviationScore >= 6) return 'critical';
  if (point.errorCount >= 2 && deviationScore >= 3) return 'elevated';
  if (deviationScore >= 1.5) return 'watch';
  return 'nominal';
}

function buildRailPoints(data: ErrorData['timeline']): RailPoint[] {
  return data.map((point, index) => {
    const pointTimestamp = Date.parse(point.hour);
    const trailingStart = pointTimestamp - TRAILING_HOURS * 60 * 60 * 1000;
    const trailingRates = Number.isFinite(pointTimestamp)
      ? data
          .slice(0, index)
          .filter((candidate) => {
            const candidateTimestamp = Date.parse(candidate.hour);
            return candidateTimestamp >= trailingStart && candidateTimestamp < pointTimestamp;
          })
          .map((candidate) =>
            candidate.totalCount > 0 ? (candidate.errorCount / candidate.totalCount) * 100 : 0,
          )
      : [];
    const hasBaseline = trailingRates.length >= 3;
    const baselineRate = median(trailingRates);
    const medianDeviation = median(trailingRates.map((rate) => Math.abs(rate - baselineRate)));
    const robustScale = Math.max(medianDeviation * 1.4826, baselineRate * 0.2, 0.25);
    const rate = point.totalCount > 0 ? (point.errorCount / point.totalCount) * 100 : 0;
    const deviationScore = hasBaseline ? Math.max(0, (rate - baselineRate) / robustScale) : 0;

    return {
      ...point,
      rate,
      baselineRate,
      deviationScore,
      severity: getSeverity(point, rate, baselineRate, deviationScore, hasBaseline),
      hasBaseline,
    };
  });
}

function formatHourUtc(hour: string, locale: Locale) {
  return `${formatHourLabel(hour, locale)} UTC`;
}

function formatRate(rate: number) {
  return `${rate.toFixed(rate < 1 ? 2 : 1)}%`;
}

export function IncidentSignalRail({ data }: { data: ErrorData['timeline'] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const pointRefs = useRef<(SVGGElement | null)[]>([]);
  const points = useMemo(() => buildRailPoints(data), [data]);
  const [selectedHour, setSelectedHour] = useState<string | null>(() => data.at(-1)?.hour ?? null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  useFontsVersion();

  if (points.length === 0) {
    return (
      <EmptyState role="status" bare className="min-h-48 px-4">
        {t.noSignals}
      </EmptyState>
    );
  }

  const matchingIndex = points.findIndex((point) => point.hour === selectedHour);
  const activeIndex = matchingIndex === -1 ? points.length - 1 : matchingIndex;
  const selected = points[activeIndex] ?? points.at(-1)!;
  const hovered = hover ? points[hover.index] : undefined;
  const shown = hovered ?? selected;
  const chartWidth = Math.max(760, LEFT + RIGHT + points.length * 24);
  const plotWidth = chartWidth - LEFT - RIGHT;
  const slotWidth = plotWidth / points.length;
  const barWidth = Math.min(12, Math.max(4, slotWidth - 3));
  const rateScale = scaleLinear()
    .domain([
      0,
      points.reduce((maximum, point) => Math.max(maximum, point.rate, point.baselineRate), 1),
    ])
    .nice(4)
    .range([RATE_TOP + RATE_HEIGHT, RATE_TOP]);
  const rateTickFormat = rateScale.tickFormat(4);
  const tickFont = chartFont(CHART_TYPE.axisLabelSub);
  const hourTicks = points.flatMap((point, index) => {
    const date = new Date(point.hour);
    if (!Number.isFinite(date.getTime())) return [];
    const label = formatHourLabel(point.hour, locale);
    return [{ index, hour: date.getUTCHours(), label, width: measureTextWidth(label, tickFont) }];
  });
  const tickLabelWidth = Math.max(0, ...hourTicks.map((tick) => tick.width));
  const tickStepHours = [6, 12, 24].find((step) => step * slotWidth >= tickLabelWidth + 16) ?? 24;
  const xTicks = hourTicks.filter((tick) => tick.hour % tickStepHours === 0);
  const maxVolume = points.reduce((maximum, point) => Math.max(maximum, point.totalCount), 1);
  const anomalyCount = points.reduce(
    (count, point) => count + (point.severity === 'nominal' ? 0 : 1),
    0,
  );

  const selectAdjacent = (event: KeyboardEvent<SVGGElement>, index: number) => {
    let nextIndex: number;
    if (event.key === 'Enter' || event.key === ' ') {
      nextIndex = index;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = Math.min(points.length - 1, index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = points.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setSelectedHour(points[nextIndex].hour);
    pointRefs.current[nextIndex]?.focus();
    track('agentic_workload_incident_hour_keyboard', {
      key: event.key,
      hour: points[nextIndex].hour,
    });
  };

  return (
    <Expandable title={t.title}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0 grow basis-48">
            <CardTitle>{t.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.baselineNote(TRAILING_HOURS, anomalyCount)}
            </p>
          </div>
          <ChartActions
            fileName="hourly-incident-signals"
            onExportPng={() => track('agentic_workload_incident_rail_export_png')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
          {(Object.keys(SEVERITY_META) as Severity[]).map((severity) => (
            <span key={severity} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 border border-black/10"
                style={{ backgroundColor: SEVERITY_META[severity].fill }}
              />
              {t.severity[severity].label}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto border-y border-border/20" data-chart-scroll>
          <svg
            width={chartWidth}
            height={CHART_HEIGHT}
            className="block"
            role="group"
            aria-label={t.ariaLabel}
            onPointerLeave={() => setHover(null)}
          >
            {rateScale.ticks(4).map((value) => (
              <g key={value}>
                <line
                  x1={LEFT}
                  x2={chartWidth - RIGHT}
                  y1={rateScale(value)}
                  y2={rateScale(value)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={LEFT - 10}
                  y={rateScale(value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--muted-foreground)"
                  fontSize={CHART_TYPE.axisLabelSub}
                  className="tabular-nums"
                >
                  {`${rateTickFormat(value)}%`}
                </text>
              </g>
            ))}
            <text
              x={LEFT - 10}
              y={VOLUME_TOP + VOLUME_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              fontSize={CHART_TYPE.axisLabelSub}
            >
              {t.requests}
            </text>

            <polyline
              points={points
                .map((point, index) => {
                  const x = LEFT + index * slotWidth + slotWidth / 2;
                  return `${x},${rateScale(point.baselineRate)}`;
                })
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.42}
              strokeWidth={1}
              strokeDasharray="3 3"
              aria-hidden="true"
            />

            {hover && hovered && (
              <line
                x1={LEFT + hover.index * slotWidth + slotWidth / 2}
                x2={LEFT + hover.index * slotWidth + slotWidth / 2}
                y1={RATE_TOP - 5}
                y2={VOLUME_TOP + VOLUME_HEIGHT + 5}
                {...CURSOR_LINE_PROPS}
                className="pointer-events-none"
              />
            )}

            {points.map((point, index) => {
              const x = LEFT + index * slotWidth + (slotWidth - barWidth) / 2;
              const y = rateScale(point.rate);
              const height = Math.max(1, RATE_TOP + RATE_HEIGHT - y);
              const volumeHeight = Math.max(1, (point.totalCount / maxVolume) * VOLUME_HEIGHT);
              const isSelected = index === activeIndex;
              const hourLabel = formatHourUtc(point.hour, locale);
              const baselineLabel = point.hasBaseline
                ? t.trailingBaselineLabel(formatRate(point.baselineRate))
                : t.baselineLearning;
              const accessibleLabel = t.accessibleLabel(
                hourLabel,
                t.severity[point.severity].label,
                point.errorCount,
                point.totalCount,
                formatRate(point.rate),
                baselineLabel,
              );

              return (
                <g
                  key={point.hour}
                  ref={(node) => {
                    pointRefs.current[index] = node;
                  }}
                  role="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={accessibleLabel}
                  aria-pressed={isSelected}
                  className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  onClick={() => {
                    setSelectedHour(point.hour);
                    track('agentic_workload_incident_hour_selected', {
                      hour: point.hour,
                      severity: point.severity,
                    });
                  }}
                  onFocus={() => setSelectedHour(point.hour)}
                  onKeyDown={(event) => selectAdjacent(event, index)}
                  onPointerMove={(event) => setHover({ index, x: event.clientX, y: event.clientY })}
                >
                  <rect
                    x={LEFT + index * slotWidth}
                    y={RATE_TOP - 5}
                    width={slotWidth}
                    height={VOLUME_TOP + VOLUME_HEIGHT - RATE_TOP + 10}
                    fill="transparent"
                  />
                  {isSelected && (
                    <rect
                      x={LEFT + index * slotWidth + 0.5}
                      y={RATE_TOP - 4.5}
                      width={Math.max(1, slotWidth - 1)}
                      height={VOLUME_TOP + VOLUME_HEIGHT - RATE_TOP + 9}
                      fill="none"
                      stroke="var(--foreground)"
                      strokeWidth={1}
                      strokeOpacity={0.6}
                      rx={2}
                    />
                  )}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                    fill={SEVERITY_META[point.severity].fill}
                    opacity={isSelected ? 1 : 0.78}
                  />
                  <rect
                    x={x}
                    y={VOLUME_TOP + VOLUME_HEIGHT - volumeHeight}
                    width={barWidth}
                    height={volumeHeight}
                    fill="#38bdf8"
                    opacity={isSelected ? 0.9 : 0.45}
                  />
                </g>
              );
            })}

            {xTicks.map((tick) => {
              const x = LEFT + tick.index * slotWidth + slotWidth / 2;
              return (
                <g key={tick.index}>
                  <line
                    x1={x}
                    x2={x}
                    y1={VOLUME_TOP + VOLUME_HEIGHT + 5}
                    y2={VOLUME_TOP + VOLUME_HEIGHT + 9}
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={Math.min(chartWidth - tick.width / 2, Math.max(tick.width / 2, x))}
                    y={CHART_HEIGHT - 12}
                    textAnchor="middle"
                    fill="var(--muted-foreground)"
                    fontSize={CHART_TYPE.axisLabelSub}
                    className="tabular-nums"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {hovered && hover && (
          <FloatingTooltip x={hover.x} y={hover.y} placement="above">
            <ChartHoverCardBody
              title={formatHourUtc(hovered.hour, locale)}
              subtitle={t.severity[hovered.severity].label}
              color={SEVERITY_META[hovered.severity].fill}
              metrics={[
                { value: formatRate(hovered.rate), label: t.errorRate },
                { value: formatNumber(hovered.errorCount), label: t.errors },
                { value: formatNumber(hovered.totalCount), label: t.requests },
              ]}
              summary={
                hovered.hasBaseline
                  ? t.trailingBaselineLabel(formatRate(hovered.baselineRate))
                  : t.baselineLearning
              }
            />
          </FloatingTooltip>
        )}

        <div
          className="grid gap-3 pt-1 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${SEVERITY_META[shown.severity].badge}`}
              >
                {t.severity[shown.severity].label}
              </span>
              <span className="truncate text-xs font-medium tabular-nums">
                {formatHourUtc(shown.hour, locale)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.severity[shown.severity].description}
            </p>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t.errorRate}</div>
            <div className="text-sm font-medium tabular-nums">{formatRate(shown.rate)}</div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(shown.errorCount)} {t.errors}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t.volume}</div>
            <div className="text-sm font-medium tabular-nums">{formatNumber(shown.totalCount)}</div>
            <div className="text-xs text-muted-foreground">{t.requests}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t.trailingBaseline}</div>
            <div className="text-sm font-medium tabular-nums">
              {shown.hasBaseline ? formatRate(shown.baselineRate) : t.learning}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {shown.hasBaseline
                ? `+${Math.max(0, shown.rate - shown.baselineRate).toFixed(2)} pp`
                : t.needs3Hours}
            </div>
          </div>
        </div>
      </div>
    </Expandable>
  );
}
