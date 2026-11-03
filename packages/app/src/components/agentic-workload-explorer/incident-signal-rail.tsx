'use client';

import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { formatExplorerDateTime, formatNumber } from '@/lib/agentic-workload-explorer/format';
import type { ErrorData } from '@/lib/agentic-workload-explorer/api-types';
import { ChartActions, Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { EmptyState } from '@/components/ui/empty-state';

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
  return formatExplorerDateTime(hour, locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
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
  const chartWidth = Math.max(760, LEFT + RIGHT + points.length * 24);
  const plotWidth = chartWidth - LEFT - RIGHT;
  const slotWidth = plotWidth / points.length;
  const barWidth = Math.min(12, Math.max(4, slotWidth - 3));
  const maxRate = points.reduce(
    (maximum, point) => Math.max(maximum, point.rate, point.baselineRate),
    1,
  );
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
              {(Object.keys(SEVERITY_META) as Severity[]).map((severity) => (
                <span
                  key={severity}
                  className="inline-flex items-center gap-1.5 text-muted-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 border border-black/10"
                    style={{ backgroundColor: SEVERITY_META[severity].fill }}
                  />
                  {t.severity[severity].label}
                </span>
              ))}
            </div>
            <p className="mt-1 text-3xs font-mono text-muted-foreground">
              {t.baselineNote(TRAILING_HOURS, anomalyCount)}
            </p>
          </div>
          <ChartActions
            fileName="hourly-incident-signals"
            onExportPng={() => track('agentic_workload_incident_rail_export_png')}
          />
        </div>

        <div className="overflow-x-auto border-y border-border/20" data-chart-scroll>
          <svg
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            className="h-[244px] min-w-[760px]"
            style={{ width: chartWidth }}
            role="group"
            aria-label={t.ariaLabel}
          >
            <text
              x={LEFT - 10}
              y={RATE_TOP + 8}
              textAnchor="end"
              fill="currentColor"
              opacity={0.55}
              className="text-3xs font-mono"
            >
              {formatRate(maxRate)}
            </text>
            <text
              x={LEFT - 10}
              y={RATE_TOP + RATE_HEIGHT}
              textAnchor="end"
              dominantBaseline="middle"
              fill="currentColor"
              opacity={0.55}
              className="text-3xs font-mono"
            >
              0%
            </text>
            <text
              x={LEFT - 10}
              y={VOLUME_TOP + VOLUME_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fill="currentColor"
              opacity={0.55}
              className="text-3xs font-mono"
            >
              {t.requests}
            </text>

            {[0, 0.5, 1].map((fraction) => {
              const y = RATE_TOP + RATE_HEIGHT * fraction;
              return (
                <line
                  key={fraction}
                  x1={LEFT}
                  x2={chartWidth - RIGHT}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={fraction === 1 ? 0.18 : 0.08}
                  strokeDasharray={fraction === 1 ? undefined : '2 3'}
                />
              );
            })}

            <polyline
              points={points
                .map((point, index) => {
                  const x = LEFT + index * slotWidth + slotWidth / 2;
                  return `${x},${RATE_TOP + RATE_HEIGHT - (point.baselineRate / maxRate) * RATE_HEIGHT}`;
                })
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.42}
              strokeWidth={1}
              strokeDasharray="3 3"
              aria-hidden="true"
            />

            {points.map((point, index) => {
              const x = LEFT + index * slotWidth + (slotWidth - barWidth) / 2;
              const y = RATE_TOP + RATE_HEIGHT - (point.rate / maxRate) * RATE_HEIGHT;
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
                      stroke="currentColor"
                      strokeWidth={1}
                      strokeOpacity={0.8}
                      strokeDasharray="2 2"
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
                  <title>{accessibleLabel}</title>
                </g>
              );
            })}

            <text
              x={LEFT}
              y={CHART_HEIGHT - 12}
              fill="currentColor"
              opacity={0.55}
              className="text-3xs font-mono"
            >
              {formatExplorerDateTime(points[0].hour, locale, {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </text>
            <text
              x={chartWidth - RIGHT}
              y={CHART_HEIGHT - 12}
              textAnchor="end"
              fill="currentColor"
              opacity={0.55}
              className="text-3xs font-mono"
            >
              {formatHourUtc(points.at(-1)!.hour, locale)}
            </text>
          </svg>
        </div>

        <div
          className="grid gap-3 pt-1 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${SEVERITY_META[selected.severity].badge}`}
              >
                {t.severity[selected.severity].label}
              </span>
              <span className="truncate text-2xs font-mono font-medium">
                {formatHourUtc(selected.hour, locale)}
              </span>
            </div>
            <p className="mt-1 text-3xs font-mono text-muted-foreground">
              {t.severity[selected.severity].description}
            </p>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t.errorRate}</div>
            <div className="text-sm font-medium tabular-nums">{formatRate(selected.rate)}</div>
            <div className="text-3xs font-mono text-muted-foreground">
              {formatNumber(selected.errorCount)} {t.errors}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t.volume}</div>
            <div className="text-sm font-medium tabular-nums">
              {formatNumber(selected.totalCount)}
            </div>
            <div className="text-3xs font-mono text-muted-foreground">{t.requests}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t.trailingBaseline}</div>
            <div className="text-sm font-medium tabular-nums">
              {selected.hasBaseline ? formatRate(selected.baselineRate) : t.learning}
            </div>
            <div className="text-3xs font-mono text-muted-foreground">
              {selected.hasBaseline
                ? `+${Math.max(0, selected.rate - selected.baselineRate).toFixed(2)} pp`
                : t.needs3Hours}
            </div>
          </div>
        </div>
      </div>
    </Expandable>
  );
}
