'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { formatDuration } from '@/lib/agentic-workload-explorer/format';
import { type StatRow } from '@/lib/agentic-workload-explorer/stat-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const COLORS = {
  prefill: '#0ea5e9', // sky-500
  decode: '#8b5cf6', // violet-500
  undecomposed: '#6b7280', // gray-500
} as const;

const STRINGS = {
  en: {
    latencyDecomposition: 'Latency Decomposition',
    prefill: 'Prefill (TTFT)',
    decode: 'Decode',
    undecomposed: 'Undecomposed',
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
    noData: 'No request data available',
    e2e: 'E2E',
    outputTokens: 'output tokens',
    turnLabel: (n: number) => `Turn ${n}`,
    reqLabel: (n: number) => `req ${n}`,
  },
  zh: {
    latencyDecomposition: '延迟分解',
    prefill: 'Prefill (TTFT)',
    decode: 'Decode',
    undecomposed: '未分解',
    expandAll: '全部展开',
    collapseAll: '全部收起',
    noData: '暂无请求数据',
    e2e: '端到端',
    outputTokens: 'output tokens',
    turnLabel: (n: number) => `轮次 ${n}`,
    reqLabel: (n: number) => `请求 ${n}`,
  },
};

type LocaleStrings = (typeof STRINGS)[keyof typeof STRINGS];

function legendItems(t: LocaleStrings) {
  return [
    { key: 'prefill', label: t.prefill, color: COLORS.prefill },
    { key: 'decode', label: t.decode, color: COLORS.decode },
    { key: 'undecomposed', label: t.undecomposed, color: COLORS.undecomposed },
  ] as const;
}

const ROW_HEIGHT = 28;
const ROW_GAP = 2;
const LABEL_WIDTH = 180;
const DURATION_WIDTH = 70;
const BAR_LEFT = LABEL_WIDTH + 8;

interface TooltipData {
  x: number;
  y: number;
  prefillMs: number;
  decodeMs: number;
  totalMs: number;
  canDecompose: boolean;
  ttftMs: number | null;
  tpotMs: number | null;
  outputTokens: number;
  label: string;
}

export function LatencyWaterfall({ rows }: { rows: StatRow[] }) {
  const t = STRINGS[useLocale()];
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(() => {
    const all = new Set<number>();
    for (const row of rows) {
      if (row.kind === 'subagent_group') all.add(row.turn);
    }
    return all;
  });
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleGroup = useCallback((turn: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      const expanding = !next.has(turn);
      if (expanding) next.add(turn);
      else next.delete(turn);
      track('agentic_workload_waterfall_group_toggled', { turn, expanded: expanding });
      return next;
    });
  }, []);

  const subagentGroupTurns = useMemo(() => {
    const turns: number[] = [];
    for (const row of rows) {
      if (row.kind === 'subagent_group') turns.push(row.turn);
    }
    return turns;
  }, [rows]);

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(subagentGroupTurns));
    track('agentic_workload_waterfall_expand_all');
  }, [subagentGroupTurns]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
    track('agentic_workload_waterfall_collapse_all');
  }, []);

  const visibleRows = useMemo(() => {
    const result: {
      key: string;
      label: string;
      durationMs: number;
      ttftMs: number | null;
      tpotMs: number | null;
      output: number;
      indent: number;
      isGroup: boolean;
      isExpanded: boolean;
      turn: number;
    }[] = [];

    for (const row of rows) {
      if (row.kind === 'main') {
        result.push({
          key: `main-${row.turn}`,
          label: t.turnLabel(row.turn),
          durationMs: row.durationMs,
          ttftMs: row.ttftMs,
          tpotMs: row.tpotMs,
          output: row.output,
          indent: 0,
          isGroup: false,
          isExpanded: false,
          turn: row.turn,
        });
      } else {
        const isExpanded = expandedGroups.has(row.turn);
        result.push({
          key: `group-${row.turn}`,
          label: `${row.label} (${row.requestCount})`,
          durationMs: row.durationMs,
          ttftMs: row.ttftMs,
          tpotMs: row.tpotMs,
          output: row.output,
          indent: 0,
          isGroup: true,
          isExpanded,
          turn: row.turn,
        });
        if (isExpanded) {
          row.children.forEach((child, ci) => {
            result.push({
              key: `group-${row.turn}-child-${ci}`,
              label: t.reqLabel(ci + 1),
              durationMs: child.durationMs,
              ttftMs: child.ttftMs,
              tpotMs: child.tpotMs,
              output: child.output,
              indent: 1,
              isGroup: false,
              isExpanded: false,
              turn: row.turn,
            });
          });
        }
      }
    }
    return result;
  }, [rows, expandedGroups, t]);

  const maxDuration = useMemo(
    () => Math.max(1, ...visibleRows.filter((r) => !r.isGroup).map((r) => r.durationMs)),
    [visibleRows],
  );

  const barWidth = containerWidth - BAR_LEFT - DURATION_WIDTH - 16;
  const svgHeight = visibleRows.length * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

  const handleMouseMove = useCallback((e: React.MouseEvent, row: (typeof visibleRows)[number]) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const canDecompose = row.ttftMs !== null && row.ttftMs > 0 && row.durationMs > 0;
    const prefillMs = canDecompose ? row.ttftMs! : 0;
    const decodeMs = canDecompose ? row.durationMs - row.ttftMs! : 0;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      prefillMs,
      decodeMs,
      totalMs: row.durationMs,
      canDecompose,
      ttftMs: row.ttftMs,
      tpotMs: row.tpotMs,
      outputTokens: row.output,
      label: row.label,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground font-mono text-xs">
        {t.noData}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.latencyDecomposition}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Legend + group controls */}
        <div className="flex items-center gap-4">
          {legendItems(t).map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-3xs font-mono text-muted-foreground">{item.label}</span>
            </div>
          ))}
          {subagentGroupTurns.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={expandAll}
                className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
              >
                {t.expandAll}
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
              >
                {t.collapseAll}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="bg-surface border border-border rounded-md p-4 overflow-x-auto relative"
      >
        <svg ref={svgRef} width={containerWidth - 32} height={svgHeight} className="block">
          {visibleRows.map((row, idx) => {
            const y = idx * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;
            const scale = barWidth > 0 ? barWidth / maxDuration : 0;

            const canDecompose = row.ttftMs !== null && row.ttftMs > 0 && row.durationMs > 0;
            const prefillMs = canDecompose ? row.ttftMs! : 0;
            const decodeMs = canDecompose ? Math.max(0, row.durationMs - row.ttftMs!) : 0;

            const prefillW = prefillMs * scale;
            const decodeW = decodeMs * scale;
            const undecomposedW = canDecompose ? 0 : row.durationMs * scale;

            const barX = BAR_LEFT;
            const segments = canDecompose
              ? [
                  { x: barX, w: prefillW, color: COLORS.prefill },
                  { x: barX + prefillW, w: decodeW, color: COLORS.decode },
                ]
              : [{ x: barX, w: undecomposedW, color: COLORS.undecomposed }];

            const isClickable = row.isGroup;
            const labelX = row.indent === 1 ? 20 : 0;

            return (
              <g
                key={row.key}
                className={isClickable ? 'cursor-pointer' : ''}
                onClick={isClickable ? () => toggleGroup(row.turn) : undefined}
                onMouseMove={(e) => handleMouseMove(e, row)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Indented border line for child rows */}
                {row.indent === 1 && (
                  <line
                    x1={8}
                    y1={y}
                    x2={8}
                    y2={y + ROW_HEIGHT}
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeOpacity={0.5}
                  />
                )}

                {/* Row label */}
                <text
                  x={labelX + 4}
                  y={y + ROW_HEIGHT / 2}
                  dominantBaseline="central"
                  className="fill-current text-muted-foreground"
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {isClickable ? (row.isExpanded ? '\u25BC ' : '\u25B6 ') : ''}
                  {row.label}
                </text>

                {/* Background track */}
                <rect
                  x={barX}
                  y={y + 2}
                  width={Math.max(0, barWidth)}
                  height={ROW_HEIGHT - 4}
                  rx={3}
                  className="fill-current"
                  style={{ color: 'var(--color-border)', opacity: 0.3 }}
                />

                {/* Latency segments — hidden for group header rows (summed bar is misleading) */}
                {!row.isGroup &&
                  segments.map((seg, si) =>
                    seg.w > 0 ? (
                      <rect
                        key={si}
                        x={seg.x}
                        y={y + 2}
                        width={seg.w}
                        height={ROW_HEIGHT - 4}
                        rx={
                          si === 0
                            ? 3
                            : si === segments.length - 1 ||
                                segments.slice(si + 1).every((s) => s.w === 0)
                              ? 3
                              : 0
                        }
                        fill={seg.color}
                        opacity={0.85}
                      />
                    ) : null,
                  )}

                {/* Duration label */}
                <text
                  x={barX + barWidth + 8}
                  y={y + ROW_HEIGHT / 2}
                  dominantBaseline="central"
                  className="fill-current text-subtle"
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {row.isGroup
                    ? ''
                    : row.durationMs > 0
                      ? formatDuration(row.durationMs)
                      : '\u2014'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-50 bg-background border border-border rounded-md shadow-lg px-3 py-2 space-y-1"
            style={{
              left: Math.min(tooltip.x + 12, containerWidth - 220),
              top: tooltip.y - 8,
              transform: 'translateY(-100%)',
            }}
          >
            <div className="text-2xs font-mono font-medium text-foreground">{tooltip.label}</div>
            <div className="text-3xs font-mono text-muted-foreground space-y-0.5">
              {tooltip.canDecompose ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm inline-block"
                      style={{ backgroundColor: COLORS.prefill }}
                    />
                    <span>
                      {t.prefill}: {formatDuration(tooltip.prefillMs)} (
                      {((tooltip.prefillMs / tooltip.totalMs) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm inline-block"
                      style={{ backgroundColor: COLORS.decode }}
                    />
                    <span>
                      {t.decode}: {formatDuration(tooltip.decodeMs)} (
                      {((tooltip.decodeMs / tooltip.totalMs) * 100).toFixed(0)}%)
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-sm inline-block"
                    style={{ backgroundColor: COLORS.undecomposed }}
                  />
                  <span>
                    {t.undecomposed}: {formatDuration(tooltip.totalMs)}
                  </span>
                </div>
              )}
              <div className="pt-1 border-t border-border">
                {t.e2e}: {formatDuration(tooltip.totalMs)}
                {tooltip.tpotMs !== null && <> &middot; TPOT: {tooltip.tpotMs.toFixed(1)}ms/tok</>}
                {tooltip.outputTokens > 0 && (
                  <>
                    {' '}
                    &middot; {tooltip.outputTokens} {t.outputTokens}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
