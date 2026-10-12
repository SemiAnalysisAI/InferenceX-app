'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type ContextTrajectories,
  type TrajectoryPoint,
  formatElapsedMMSS,
} from '@/lib/agentic-workload-explorer/tokens-over-time';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { BrushBar, useBrush } from '@/components/agentic-workload-explorer/brush-bar';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    sectionTitle: 'Trace of Context Growth Over Time',
    noData: 'No request data available',
    totalRequests: (total: number, subagent: number, invocations: number, main: number) =>
      `${total} total requests split up into ${subagent} sub-agent${invocations > 0 ? ` (${invocations} invocation${invocations === 1 ? '' : 's'})` : ''} and ${main} main-agent requests`,
    mainAgent: 'Main Agent',
    resetZoom: 'Reset Zoom',
    inputTokens: 'input tokens',
    subagentFallback: 'sub-agent',
  },
  zh: {
    sectionTitle: '上下文增长轨迹',
    noData: '暂无请求数据',
    totalRequests: (total: number, subagent: number, invocations: number, main: number) =>
      `共 ${total} 个请求，其中 ${subagent} 个子智能体请求${invocations > 0 ? `（${invocations} 次调用）` : ''}、${main} 个主智能体请求`,
    mainAgent: '主智能体',
    resetZoom: '重置缩放',
    inputTokens: 'input tokens',
    subagentFallback: '子智能体',
  },
} as const;

// Sub-agent palette: each invocation gets its own hue spread evenly around the
// wheel so 20+ parallel sub-agents stay visually distinguishable. The main
// agent stays on the foreground color so it adapts to dark mode and reads as
// the spine of the chart.
function subagentColor(index: number, total: number): string {
  // Stagger across two lightness tiers so adjacent hues don't blur into each
  // other when total is large. Saturated mid-luminosity colors stay legible
  // on both light and dark surfaces.
  const hue = (index * 360) / Math.max(total, 1);
  const lightness = index % 2 === 0 ? 48 : 58;
  return `hsl(${hue.toFixed(1)} 72% ${lightness}%)`;
}

const MARGIN = { top: 8, right: 16, bottom: 28, left: 56 } as const;
const HEIGHT = 320;
const POINT_HIT_RADIUS = 12;

interface TooltipState {
  point: TrajectoryPoint;
  agentLabel: string;
  agentColor: string;
  x: number;
  y: number;
}

export function ContextTrajectoriesChart({ trajectories }: { trajectories: ContextTrajectories }) {
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

  const xFull = trajectories.maxElapsed || 1;
  // Brush window controls the visible x-range. Y autoscales to the points
  // (main + sub-agent) inside the window so a deep zoom isn't dominated by
  // brushed-out tall turns.
  const brush = useBrush({ fullStart: 0, fullEnd: xFull });
  const xSpan = Math.max(1, brush.end - brush.start);

  const yDomain = useMemo(() => {
    let m = 0;
    const visit = (p: TrajectoryPoint) => {
      if (p.elapsedMs < brush.start || p.elapsedMs > brush.end) return;
      if (p.total > m) m = p.total;
    };
    trajectories.main.forEach(visit);
    for (const traj of trajectories.subagents) traj.points.forEach(visit);
    return m || 1;
  }, [trajectories.main, trajectories.subagents, brush.start, brush.end]);

  const xOf = (ms: number) => ((ms - brush.start) / xSpan) * innerW;
  const yOf = (tokens: number) => innerH - (tokens / yDomain) * innerH;

  const mainPath = useMemo(
    () => buildLinePath(trajectories.main, xOf, yOf),
    // Recompute when any scale dependency changes (innerW/innerH/brush/yDomain).
    [trajectories.main, innerW, innerH, brush.start, brush.end, yDomain],
  );

  const subPaths = useMemo(
    () =>
      trajectories.subagents.map((traj, i) => ({
        // Sub-agent traces include vertical risers from the baseline at start
        // AND end so a single high-context call (the common case for one-shot
        // sub-agents) renders as a clearly visible vertical bar instead of
        // a single barely-perceptible point near the top of the chart.
        line: buildLinePath(traj.points, xOf, yOf, { withBaselineRisers: innerH }),
        fill: buildFillPath(traj.points, xOf, yOf, innerH),
        label: traj.label ?? t.subagentFallback,
        key: traj.key,
        color: subagentColor(i, trajectories.subagents.length),
      })),
    [trajectories.subagents, innerW, innerH, brush.start, brush.end, yDomain, t],
  );

  const subColorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of subPaths) m.set(p.key, p.color);
    return m;
  }, [subPaths]);

  const xTicks = useMemo(() => {
    const n = 6;
    return Array.from(
      { length: n + 1 },
      (_, i) => brush.start + ((brush.end - brush.start) * i) / n,
    );
  }, [brush.start, brush.end]);

  const yTicks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => (yDomain * i) / n);
  }, [yDomain]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (trajectories.main.length === 0 && trajectories.subagents.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const localX = e.clientX - rect.left - MARGIN.left;
    if (localX < 0 || localX > innerW) {
      setTooltip(null);
      return;
    }

    let bestPoint: TrajectoryPoint | null = null;
    let bestLabel = 'main agent';
    let bestColor = 'currentColor';
    let bestDx = Infinity;

    const considerSeries = (points: TrajectoryPoint[], label: string, color: string) => {
      for (const p of points) {
        // Skip points outside the brushed window — they're clipped visually
        // and shouldn't appear as hover targets.
        if (p.elapsedMs < brush.start || p.elapsedMs > brush.end) continue;
        const dx = Math.abs(xOf(p.elapsedMs) - localX);
        if (dx < bestDx) {
          bestDx = dx;
          bestPoint = p;
          bestLabel = label;
          bestColor = color;
        }
      }
    };

    considerSeries(trajectories.main, 'main agent', 'currentColor');
    for (const traj of trajectories.subagents) {
      const color = subColorByKey.get(traj.key) ?? 'currentColor';
      considerSeries(traj.points, traj.label ?? t.subagentFallback, color);
    }

    if (!bestPoint || bestDx > POINT_HIT_RADIUS * 4) {
      setTooltip(null);
      return;
    }
    setTooltip({
      point: bestPoint,
      agentLabel: bestLabel,
      agentColor: bestColor,
      x: e.clientX,
      y: e.clientY,
    });
  }

  if (trajectories.counts.total === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-12 text-center font-mono text-xs text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  const { main, subagent, invocations, total } = trajectories.counts;

  return (
    <div className="space-y-4">
      <div className="sticky -top-5 z-20 -mx-2 space-y-2 border-b border-border bg-background/95 px-2 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xs font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.sectionTitle}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-1.5">
          <span className="font-mono text-3xs text-muted-foreground">
            {t.totalRequests(total, subagent, invocations, main)}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-foreground/70" />
              <span className="font-mono text-3xs text-muted-foreground">{t.mainAgent}</span>
            </div>
            {subPaths.map((p) => (
              <div key={`legend-${p.key}`} className="flex items-center gap-1.5" title={p.label}>
                <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                <span className="font-mono text-3xs text-muted-foreground">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative rounded-md border border-border bg-surface p-4">
        <div className="mb-1 flex items-center justify-end">
          {brush.isActive && (
            <button
              type="button"
              onClick={() => {
                brush.reset();
                track('agentic_workload_trajectories_zoom_reset');
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
                    className="fill-muted-foreground font-mono text-3xs"
                  >
                    {formatNumber(Math.round(tick))}
                  </text>
                </g>
              );
            })}

            {/* Data layer — clipped to the plot rect so brushed-out segments
                don't leak past the y-axis or into the x-axis label band. */}
            <g clipPath={`url(#clip-${clipId})`}>
              {subPaths.map((p) => (
                <path key={`sub-fill-${p.key}`} d={p.fill} fill={p.color} fillOpacity={0.14} />
              ))}
              {subPaths.map((p) => (
                <path
                  key={`sub-line-${p.key}`}
                  d={p.line}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={2}
                  strokeOpacity={0.95}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              <path
                d={mainPath}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={1.75}
              />
              {tooltip && (
                <circle
                  cx={xOf(tooltip.point.elapsedMs)}
                  cy={yOf(tooltip.point.total)}
                  r={4}
                  fill={tooltip.agentColor}
                  fillOpacity={0.95}
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
                    className="fill-muted-foreground font-mono text-3xs"
                  >
                    {formatElapsedMMSS(tick)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Brush bar — drag the handles to narrow the visible window, or grab
            the selection body to pan. Same range-selector pattern as the
            tokens-over-time chart so the two views feel uniform. */}
        <div className="mt-2">
          <BrushBar
            width={width - 32}
            fullStart={0}
            fullEnd={xFull}
            start={brush.start}
            end={brush.end}
            onChange={brush.setBrush}
            formatValue={formatElapsedMMSS}
            labelPadding={MARGIN.left}
          />
        </div>

        {tooltip && <ChartTooltip data={tooltip} t={t} />}
      </div>
    </div>
  );
}

function buildLinePath(
  points: TrajectoryPoint[],
  xOf: (ms: number) => number,
  yOf: (tokens: number) => number,
  opts: { withBaselineRisers?: number } = {},
): string {
  if (points.length === 0) return '';
  const baseline = opts.withBaselineRisers;
  if (baseline === undefined) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.elapsedMs)} ${yOf(p.total)}`)
      .join(' ');
  }
  // Start from the baseline directly under the first point, rise vertically to
  // the first point, trace through the rest, then drop vertically back to the
  // baseline under the last point. Makes a sub-agent invocation look like a
  // closed visual unit even when it has only one or two points.
  const first = points.at(0)!;
  const last = points.at(-1)!;
  const cmds: string[] = [`M ${xOf(first.elapsedMs)} ${baseline}`];
  for (const p of points) {
    cmds.push(`L ${xOf(p.elapsedMs)} ${yOf(p.total)}`);
  }
  cmds.push(`L ${xOf(last.elapsedMs)} ${baseline}`);
  return cmds.join(' ');
}

function buildFillPath(
  points: TrajectoryPoint[],
  xOf: (ms: number) => number,
  yOf: (tokens: number) => number,
  innerH: number,
): string {
  if (points.length === 0) return '';
  const top = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.elapsedMs)} ${yOf(p.total)}`)
    .join(' ');
  const last = points.at(-1)!;
  const first = points.at(0)!;
  return `${top} L ${xOf(last.elapsedMs)} ${innerH} L ${xOf(first.elapsedMs)} ${innerH} Z`;
}

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function ChartTooltip({ data, t }: { data: TooltipState; t: Strings }) {
  const { point, agentLabel, agentColor } = data;
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-border bg-surface p-2.5 shadow-lg"
      style={{ left: data.x + 12, top: data.y - 10 }}
    >
      <div className="space-y-1 font-mono text-2xs">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: agentColor }} />
          <span>{agentLabel}</span>
        </div>
        <div className="text-muted-foreground">@ {formatElapsedMMSS(point.elapsedMs)}</div>
        <div className="flex items-center gap-2 border-t border-border pt-1 text-foreground">
          <span className="text-muted-foreground">{t.inputTokens}</span>
          <span className="ml-auto font-bold tabular-nums">{formatNumber(point.total)}</span>
        </div>
      </div>
    </div>
  );
}
