'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  type TokenPoint,
  type TokenSplitMode,
  computeCacheHitRates,
  formatElapsedMMSS,
} from '@/lib/agentic-workload-explorer/tokens-over-time';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { BrushBar, useBrush } from '@/components/agentic-workload-explorer/brush-bar';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpandTrigger } from '@/components/agentic-workload-explorer/expandable-chart';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { TOKEN_SERIES_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { formatAxisNumber } from '@/components/agentic-workload-explorer/trends-charts';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { CURSOR_LINE_PROPS } from '@/lib/d3-chart/cursor';

const STRINGS = {
  en: {
    sectionTitle: 'Tokens over time',
    noData: 'No request data available',
    requests: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    cachedTokens: 'Cached tokens',
    uncachedTokens: 'Uncached tokens',
    apiHitRateLabel: 'API cache hit rate',
    apiHitRateTooltip:
      'Cache hits as reported by the API, summed across every request in this view.',
    hashHitRateLabel: 'Theoretical upper bound cache hit rate',
    hashHitRateSubLabel: 'Assuming infinite cache TTL & infinitely large cache',
    hashHitRateTooltip:
      "Hash-block prefix matches against the whole session's chain — the highest hit rate achievable with no eviction and unlimited capacity.",
    resetZoom: 'Reset zoom',
    turnLabel: (n: number) => `turn ${n}`,
    cached: 'cached',
    uncached: 'uncached',
    total: 'total',
  },
  zh: {
    sectionTitle: 'Token 随时间变化',
    noData: '暂无请求数据',
    requests: (n: number) => `${n} 个请求`,
    cachedTokens: '已缓存 Token',
    uncachedTokens: '未缓存 Token',
    apiHitRateLabel: 'API 缓存命中率',
    apiHitRateTooltip: '此视图中所有请求的 API 上报缓存命中汇总。',
    hashHitRateLabel: '理论上限缓存命中率',
    hashHitRateSubLabel: '假设缓存 TTL 无限且容量无限',
    hashHitRateTooltip:
      '基于 hash block 前缀与整个 session chain 的匹配 —— 在无淘汰和无限容量下可达到的最高命中率。',
    resetZoom: '重置缩放',
    turnLabel: (n: number) => `第 ${n} 轮`,
    cached: '已缓存',
    uncached: '未缓存',
    total: '合计',
  },
} as const;

const COLOR_CACHED = TOKEN_SERIES_COLORS.cacheRead;
const COLOR_UNCACHED = TOKEN_SERIES_COLORS.input;

const MARGIN = { top: 8, right: 56, bottom: 28, left: 56 } as const;
const TICK_STYLE = {
  fontSize: px(CHART_TYPE.axisLabel),
  fontFamily: CHART_FONT_SANS,
  fontVariantNumeric: 'tabular-nums',
} as const;
const ELAPSED_TICK_STEPS_MS = [
  1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 10_800_000, 21_600_000,
];

export function elapsedTicks(start: number, end: number, target = 6): number[] {
  const span = Math.max(1, end - start);
  const step =
    ELAPSED_TICK_STEPS_MS.find((s) => span / s <= target) ?? ELAPSED_TICK_STEPS_MS.at(-1)!;
  const ticks: number[] = [];
  for (let v = Math.ceil(start / step) * step; v <= end; v += step) ticks.push(v);
  return ticks;
}

const HEIGHT = 320;
const POINT_HIT_RADIUS = 12;

interface TooltipState {
  point: TokenPoint;
  x: number;
  y: number;
}

export function TokensOverTimeChart({
  points,
  mode,
  agentLabel = 'Main Agent',
}: {
  points: TokenPoint[];
  mode: TokenSplitMode;
  agentLabel?: string;
}) {
  const t = STRINGS[useLocale()];
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const clipId = useId().replaceAll(':', '');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const splitOf = (p: TokenPoint) => (mode === 'hash' ? p.hash : p.api);

  const maxElapsed = useMemo(() => {
    let mE = 0;
    for (const p of points) {
      if (p.elapsedMs > mE) mE = p.elapsedMs;
    }
    return mE || 1;
  }, [points]);

  const hitRates = useMemo(() => computeCacheHitRates(points), [points]);

  const brush = useBrush({ fullStart: 0, fullEnd: maxElapsed });

  const visiblePoints = useMemo(
    () => points.filter((p) => p.elapsedMs >= brush.start && p.elapsedMs <= brush.end),
    [points, brush.start, brush.end],
  );

  const yScale = useMemo(() => {
    let mT = 0;
    for (const p of visiblePoints) {
      const total = splitOf(p).total;
      if (total > mT) mT = total;
    }
    return d3
      .scaleLinear()
      .domain([0, mT || 1])
      .range([innerH, 0])
      .nice(4);
  }, [visiblePoints, mode, innerH]);

  const xSpan = Math.max(1, brush.end - brush.start);
  const xOf = (ms: number) => ((ms - brush.start) / xSpan) * innerW;
  const yOf = (tokens: number) => yScale(tokens);

  const { totalPath, cachedFill, uncachedFill } = useMemo(() => {
    if (points.length === 0) {
      return { totalPath: '', cachedFill: '', uncachedFill: '' };
    }

    const totalCmds: string[] = [];
    const cachedTopCmds: string[] = [];
    const uncachedTopCmds: string[] = [];

    points.forEach((p, i) => {
      const split = splitOf(p);
      const x = xOf(p.elapsedMs);
      const yCached = yOf(split.cached);
      const yTotal = yOf(split.total);
      const cmd = i === 0 ? 'M' : 'L';
      cachedTopCmds.push(`${cmd} ${x} ${yCached}`);
      uncachedTopCmds.push(`${cmd} ${x} ${yTotal}`);
      totalCmds.push(`${cmd} ${x} ${yTotal}`);
    });

    const last = points.at(-1)!;
    const first = points.at(0)!;
    const baselineRight = `L ${xOf(last.elapsedMs)} ${innerH}`;
    const baselineLeft = `L ${xOf(first.elapsedMs)} ${innerH} Z`;

    const cached = `${cachedTopCmds.join(' ')} ${baselineRight} ${baselineLeft}`;

    const reverseCached = [...cachedTopCmds]
      .toReversed()
      .map((cmd) => cmd.replace(/^M/u, 'L'))
      .join(' ');
    const uncached = `${uncachedTopCmds.join(' ')} ${reverseCached} Z`;

    const total = totalCmds.join(' ');
    return { totalPath: total, cachedFill: cached, uncachedFill: uncached };
  }, [points, mode, innerW, innerH, brush.start, brush.end, yScale]);

  const xTicks = useMemo(
    () => elapsedTicks(brush.start, brush.end, Math.min(6, Math.max(2, Math.floor(innerW / 72)))),
    [brush.start, brush.end, innerW],
  );

  const yTicks = useMemo(() => yScale.ticks(4), [yScale]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (visiblePoints.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const localX = e.clientX - rect.left - MARGIN.left;
    if (localX < 0 || localX > innerW) {
      setTooltip(null);
      return;
    }
    let nearest: TokenPoint | null = null;
    let nearestDx = Infinity;
    for (const p of visiblePoints) {
      const dx = Math.abs(xOf(p.elapsedMs) - localX);
      if (dx < nearestDx) {
        nearestDx = dx;
        nearest = p;
      }
    }
    if (!nearest || nearestDx > POINT_HIT_RADIUS * 4) {
      setTooltip(null);
      return;
    }
    setTooltip({
      point: nearest,
      x: e.clientX,
      y: e.clientY,
    });
  }

  if (points.length === 0) {
    return <EmptyState className="py-12">{t.noData}</EmptyState>;
  }

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0 grow basis-48">
            <CardTitle>{t.sectionTitle}</CardTitle>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {t.requests(points.length)} · {agentLabel}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
            {brush.isActive && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  brush.reset();
                  track('agentic_workload_tokens_zoom_reset');
                }}
              >
                {t.resetZoom}
              </Button>
            )}
            <ExpandTrigger />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: COLOR_CACHED, opacity: 0.55 }}
            />
            <span className="text-xs text-muted-foreground">{t.cachedTokens}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: COLOR_UNCACHED, opacity: 0.55 }}
            />
            <span className="text-xs text-muted-foreground">{t.uncachedTokens}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <HitRateTile
            label={t.apiHitRateLabel}
            value={hitRates.api}
            tooltip={t.apiHitRateTooltip}
          />
          <HitRateTile
            label={t.hashHitRateLabel}
            value={hitRates.hash}
            subLabel={t.hashHitRateSubLabel}
            tooltip={t.hashHitRateTooltip}
          />
        </div>

        <div ref={containerRef} className="relative">
          <svg
            role="img"
            aria-label={t.sectionTitle}
            width={width}
            height={HEIGHT}
            className="block"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            <defs>
              <clipPath id={`clip-${clipId}`}>
                <rect x={0} y={0} width={innerW} height={innerH} />
              </clipPath>
            </defs>
            <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
              {yTicks.map((tick, i) => {
                const y = yOf(tick);
                return (
                  <g key={`y-${i}`}>
                    <line
                      x1={0}
                      x2={innerW}
                      y1={y}
                      y2={y}
                      stroke="var(--chart-grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={-8}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="fill-muted-foreground"
                      style={TICK_STYLE}
                    >
                      {formatAxisNumber(tick)}
                    </text>
                  </g>
                );
              })}

              <g clipPath={`url(#clip-${clipId})`}>
                <path d={cachedFill} fill={COLOR_CACHED} fillOpacity={0.55} />
                <path d={uncachedFill} fill={COLOR_UNCACHED} fillOpacity={0.55} />
                <path
                  d={totalPath}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.7}
                  strokeWidth={1.5}
                />
                {tooltip && (
                  <>
                    <line
                      x1={xOf(tooltip.point.elapsedMs)}
                      x2={xOf(tooltip.point.elapsedMs)}
                      y1={0}
                      y2={innerH}
                      {...CURSOR_LINE_PROPS}
                      pointerEvents="none"
                    />
                    <circle
                      cx={xOf(tooltip.point.elapsedMs)}
                      cy={yOf(splitOf(tooltip.point).total)}
                      r={4}
                      fill="currentColor"
                      fillOpacity={0.9}
                    />
                  </>
                )}
              </g>

              <line
                x1={0}
                x2={innerW}
                y1={innerH}
                y2={innerH}
                stroke="currentColor"
                strokeOpacity={0.2}
              />

              {xTicks.map((tick, i) => {
                const x = xOf(tick);
                return (
                  <g key={`x-${i}`}>
                    <line
                      x1={x}
                      x2={x}
                      y1={innerH}
                      y2={innerH + 4}
                      stroke="currentColor"
                      strokeOpacity={0.3}
                    />
                    <text
                      x={x}
                      y={innerH + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      style={TICK_STYLE}
                    >
                      {formatElapsedMMSS(tick)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="mt-3">
            <BrushBar
              width={width}
              fullStart={0}
              fullEnd={maxElapsed}
              start={brush.start}
              end={brush.end}
              onChange={brush.setBrush}
              formatValue={formatElapsedMMSS}
              labelPadding={MARGIN.left}
            />
          </div>

          {tooltip && <ChartTooltip data={tooltip} mode={mode} t={t} />}
        </div>
      </CardContent>
    </Card>
  );
}

function HitRateTile({
  label,
  value,
  subLabel,
  tooltip,
}: {
  label: string;
  value: number;
  subLabel?: string;
  tooltip?: string;
}) {
  return (
    <div
      className="flex items-baseline gap-3 rounded-md border border-border/30 bg-card px-2.5 py-1.5"
      title={tooltip}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
        {subLabel && <div className="truncate text-xs text-muted-foreground">{subLabel}</div>}
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function ChartTooltip({ data, mode, t }: { data: TooltipState; mode: TokenSplitMode; t: Strings }) {
  const { point } = data;
  const split = mode === 'hash' ? point.hash : point.api;
  return (
    <FloatingTooltip x={data.x} y={data.y}>
      <ChartHoverCardBody
        title={t.turnLabel(point.turn)}
        subtitle={[mode === 'hash' ? 'hash' : 'api', point.subagentLabel]
          .filter(Boolean)
          .join(' · ')}
        metrics={[
          { value: formatNumber(split.cached), label: t.cached, color: COLOR_CACHED },
          { value: formatNumber(split.uncached), label: t.uncached, color: COLOR_UNCACHED },
          { value: formatNumber(split.total), label: t.total },
        ]}
        summary={`@ ${formatElapsedMMSS(point.elapsedMs)}`}
      />
    </FloatingTooltip>
  );
}
