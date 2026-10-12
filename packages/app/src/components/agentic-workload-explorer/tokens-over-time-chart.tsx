'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
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

const STRINGS = {
  en: {
    sectionTitle: 'Tokens Over Time',
    noData: 'No request data available',
    requests: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    cachedTokens: 'Cached Tokens',
    uncachedTokens: 'Uncached Tokens',
    apiHitRateLabel: 'API Cache Hit Rate',
    apiHitRateTooltip:
      'Cache hits as reported by the API, summed across every request in this view.',
    hashHitRateLabel: 'Theoretical Upper Bound Cache Hit Rate',
    hashHitRateSubLabel: 'Assuming Infinite Cache TTL & Infinitely Large Cache',
    hashHitRateTooltip:
      "Hash-block prefix matches against the whole session's chain — the highest hit rate achievable with no eviction and unlimited capacity.",
    resetZoom: 'Reset Zoom',
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
    turnLabel: (n: number) => `turn ${n}`,
    cached: '已缓存',
    uncached: '未缓存',
    total: '合计',
  },
} as const;

// Mirror the COLORS palette used by token-flamegraph.tsx so the legend reads
// consistently across both views. The values are tailwind 500-shade tokens.
const COLOR_CACHED = '#10b981'; // emerald-500
const COLOR_UNCACHED = '#0ea5e9'; // sky-500

const MARGIN = { top: 8, right: 16, bottom: 28, left: 56 } as const;
const HEIGHT = 320;
const POINT_HIT_RADIUS = 12; // px hit-test radius for hover/tooltip

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
  /** Display name of the agent whose requests are being plotted. */
  agentLabel?: string;
}) {
  const t = STRINGS[useLocale()];
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // Unique clipPath ID per component instance — two charts on the same page
  // would otherwise share clipping bounds and collide on the first render.
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

  // Read the active split off each point. Values, max, and tooltip all
  // adapt as the user toggles between API-reported and hash-block modes.
  const splitOf = (p: TokenPoint) => (mode === 'hash' ? p.hash : p.api);

  // Full data extent — anchors the brush bar's track and the chart's initial
  // window. Computed once across all points (independent of mode).
  const maxElapsed = useMemo(() => {
    let mE = 0;
    for (const p of points) {
      if (p.elapsedMs > mE) mE = p.elapsedMs;
    }
    return mE || 1;
  }, [points]);

  // Aggregate hit rates over every visible point — both api and hash, always.
  // They sit in the header regardless of the active sub-mode so the user can
  // compare what the API actually cached against the trie-derived upper bound.
  const hitRates = useMemo(() => computeCacheHitRates(points), [points]);

  // Brush window controls the visible x-range. Y autoscales to the points
  // inside the window so a deep zoom on a single-turn doesn't waste vertical
  // headroom on tall off-screen turns.
  const brush = useBrush({ fullStart: 0, fullEnd: maxElapsed });

  const visiblePoints = useMemo(
    () => points.filter((p) => p.elapsedMs >= brush.start && p.elapsedMs <= brush.end),
    [points, brush.start, brush.end],
  );

  const maxTotal = useMemo(() => {
    let mT = 0;
    for (const p of visiblePoints) {
      const total = splitOf(p).total;
      if (total > mT) mT = total;
    }
    return mT || 1;
  }, [visiblePoints, mode]);

  // Scales: time → x px, tokens → y px (with y inverted because SVG origin is
  // top-left). Both derive from the brush window so the chart always shows the
  // selected sub-range.
  const xSpan = Math.max(1, brush.end - brush.start);
  const xOf = (ms: number) => ((ms - brush.start) / xSpan) * innerW;
  const yOf = (tokens: number) => innerH - (tokens / maxTotal) * innerH;

  // SVG path strings for the two stacked fills + the dark total stroke. We
  // build paths from EVERY point (not just the brushed subset) and rely on the
  // SVG clipPath to crop off-screen segments. This keeps the line continuous
  // across the visible edge instead of stopping abruptly at the brush handle.
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

    // Close fills back to the baseline (y = innerH). The non-null assertions
    // are safe — we early-returned on `points.length === 0` above.
    const last = points.at(-1)!;
    const first = points.at(0)!;
    const baselineRight = `L ${xOf(last.elapsedMs)} ${innerH}`;
    const baselineLeft = `L ${xOf(first.elapsedMs)} ${innerH} Z`;

    // Cached layer: from baseline up to cached top.
    const cached = `${cachedTopCmds.join(' ')} ${baselineRight} ${baselineLeft}`;

    // Uncached layer: drawn between cached top and total top — a closed
    // ribbon traced forward along the total then backward along the cached top.
    // Strip every `M` from the reversed segment: the original cachedTopCmds
    // starts with `M`, which lands at the end after toReversed() and would
    // otherwise inject a "move to" mid-path that breaks the polygon.
    const reverseCached = [...cachedTopCmds]
      .toReversed()
      .map((cmd) => cmd.replace(/^M/u, 'L'))
      .join(' ');
    const uncached = `${uncachedTopCmds.join(' ')} ${reverseCached} Z`;

    const total = totalCmds.join(' ');
    return { totalPath: total, cachedFill: cached, uncachedFill: uncached };
  }, [points, mode, innerW, innerH, brush.start, brush.end, maxTotal]);

  // 5–7 evenly spaced ticks across the BRUSHED window so labels stay readable
  // when the user zooms in to a sub-range.
  const xTicks = useMemo(() => {
    const n = 6;
    return Array.from(
      { length: n + 1 },
      (_, i) => brush.start + ((brush.end - brush.start) * i) / n,
    );
  }, [brush.start, brush.end]);

  const yTicks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => (maxTotal * i) / n);
  }, [maxTotal]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (visiblePoints.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const localX = e.clientX - rect.left - MARGIN.left;
    if (localX < 0 || localX > innerW) {
      setTooltip(null);
      return;
    }
    // Find nearest VISIBLE point by x position — points outside the brush
    // window are clipped, so the tooltip ignores them.
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
    return (
      <div className="rounded-md border border-border bg-surface p-12 text-center font-mono text-xs text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — sticky with the same negative-top trick used on the per-turn
          flamegraph so it stays flush below the global header on scroll. */}
      <div className="sticky -top-5 z-20 -mx-2 space-y-2 border-b border-border bg-background/95 px-2 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xs font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.sectionTitle}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-3xs text-muted-foreground">
            {t.requests(points.length)} · <span className="text-foreground">{agentLabel}</span>
          </span>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLOR_CACHED, opacity: 0.55 }}
              />
              <span className="font-mono text-3xs text-muted-foreground">{t.cachedTokens}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLOR_UNCACHED, opacity: 0.55 }}
              />
              <span className="font-mono text-3xs text-muted-foreground">{t.uncachedTokens}</span>
            </div>
          </div>
        </div>

        {/* Aggregate hit rates — visible in both API Cache and Hash Blocks
            sub-modes so the API-reported number can be compared directly to
            the trie-derived upper bound. */}
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
      </div>

      <div ref={containerRef} className="relative rounded-md border border-border bg-surface p-4">
        <div className="mb-1 flex items-center justify-end">
          {brush.isActive && (
            <button
              type="button"
              onClick={() => {
                brush.reset();
                track('agentic_workload_tokens_zoom_reset');
              }}
              className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-3xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {t.resetZoom}
            </button>
          )}
        </div>
        <svg
          width={width - 32}
          viewBox={`0 0 ${width - 32} ${HEIGHT}`}
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
            {/* Y-axis gridlines + labels */}
            {yTicks.map((tick, i) => {
              const y = yOf(tick);
              return (
                <g key={`y-${i}`}>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                  />
                  <text
                    x={-8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="font-mono text-3xs fill-muted-foreground"
                  >
                    {formatNumber(Math.round(tick))}
                  </text>
                </g>
              );
            })}

            {/* Data layer — clipped to the plot rect so brushed-out segments
                don't leak past the y-axis or into the x-axis label band. */}
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
                <circle
                  cx={xOf(tooltip.point.elapsedMs)}
                  cy={yOf(splitOf(tooltip.point).total)}
                  r={4}
                  fill="currentColor"
                  fillOpacity={0.9}
                />
              )}
            </g>

            {/* X-axis baseline */}
            <line
              x1={0}
              x2={innerW}
              y1={innerH}
              y2={innerH}
              stroke="currentColor"
              strokeOpacity={0.2}
            />

            {/* X-axis ticks + labels */}
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
                    className="font-mono text-3xs fill-muted-foreground"
                  >
                    {formatElapsedMMSS(tick)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Brush bar — drag the handles to narrow the visible window, or grab
            the selection body to pan. Matches the Epoch AI data explorer's
            range-selector pattern. */}
        <div className="mt-2">
          <BrushBar
            width={width - 32}
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
    </div>
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
      className="flex items-baseline gap-3 rounded-md border border-border bg-surface px-2.5 py-1.5"
      title={tooltip}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-3xs font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {label}
        </div>
        {subLabel && <div className="truncate font-mono text-3xs text-subtle">{subLabel}</div>}
      </div>
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
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
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-border bg-surface p-2.5 shadow-lg"
      style={{ left: data.x + 12, top: data.y - 10 }}
    >
      <div className="space-y-1 font-mono text-2xs">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <span>{t.turnLabel(point.turn)}</span>
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-3xs font-normal text-muted-foreground">
            {mode === 'hash' ? 'hash' : 'api'}
          </span>
          {point.subagentLabel && (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-3xs font-normal text-muted-foreground">
              {point.subagentLabel}
            </span>
          )}
        </div>
        <div className="text-muted-foreground">@ {formatElapsedMMSS(point.elapsedMs)}</div>
        <div className="flex items-center gap-2 text-foreground">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: COLOR_CACHED }}
          />
          <span className="text-muted-foreground">{t.cached}</span>
          <span className="ml-auto tabular-nums">{formatNumber(split.cached)}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: COLOR_UNCACHED }}
          />
          <span className="text-muted-foreground">{t.uncached}</span>
          <span className="ml-auto tabular-nums">{formatNumber(split.uncached)}</span>
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-1 text-foreground">
          <span className="text-muted-foreground">{t.total}</span>
          <span className="ml-auto font-bold tabular-nums">{formatNumber(split.total)}</span>
        </div>
      </div>
    </div>
  );
}
