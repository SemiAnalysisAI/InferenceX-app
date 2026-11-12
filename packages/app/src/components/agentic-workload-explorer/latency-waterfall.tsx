'use client';

import { useMemo, useState, useCallback } from 'react';
import { formatDuration } from '@/lib/agentic-workload-explorer/format';
import { type StatRow } from '@/lib/agentic-workload-explorer/stat-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Button } from '@/components/ui/button';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { chartFont, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TOKEN_SERIES_COLORS,
  NEUTRAL_SERIES_COLOR,
} from '@/components/agentic-workload-explorer/series-colors';
import {
  ShowMoreRows,
  useRowLimit,
} from '@/components/agentic-workload-explorer/conversation-view';
import { fitLabel, rowChartColumns } from '@/components/agentic-workload-explorer/row-chart-layout';

const COLORS = {
  prefill: TOKEN_SERIES_COLORS.input,
  decode: TOKEN_SERIES_COLORS.output,
  undecomposed: NEUTRAL_SERIES_COLOR,
} as const;

const STRINGS = {
  en: {
    latencyDecomposition: 'Latency decomposition',
    prefill: 'Prefill (TTFT)',
    decode: 'Decode',
    undecomposed: 'Undecomposed',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
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
    outputTokens: '输出 token',
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
  const [rowLimit, , showMoreRows] = useRowLimit();
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  const containerWidth = dimensions.width;
  useFontsVersion();

  const toggleGroup = useCallback((turn: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      const expanding = !next.has(turn);
      if (expanding) next.add(turn);
      else next.delete(turn);
      track('agentic_workload_waterfall_group_toggled', { turn, enabled: expanding });
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

  const columns = rowChartColumns(containerWidth);
  const barLeft = columns.label + 8;
  const labelFont = chartFont(CHART_TYPE.axisLabel);
  const barWidth = containerWidth - barLeft - columns.value - 8;
  const shownRows = visibleRows.length > rowLimit ? visibleRows.slice(0, rowLimit) : visibleRows;
  const svgHeight = shownRows.length * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;

  const handleMouseMove = useCallback((e: React.MouseEvent, row: (typeof visibleRows)[number]) => {
    const canDecompose = row.ttftMs !== null && row.ttftMs > 0 && row.durationMs > 0;
    const prefillMs = canDecompose ? row.ttftMs! : 0;
    const decodeMs = canDecompose ? row.durationMs - row.ttftMs! : 0;
    setTooltip({
      x: e.clientX,
      y: e.clientY,
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
    return <EmptyState className="h-32">{t.noData}</EmptyState>;
  }

  return (
    <Card className="relative">
      <CardHeader className="gap-2 pb-3">
        <CardTitle>{t.latencyDecomposition}</CardTitle>
        <div className="flex flex-wrap items-center gap-4">
          {legendItems(t).map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
          {subagentGroupTurns.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" size="xs" onClick={expandAll}>
                {t.expandAll}
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={collapseAll}>
                {t.collapseAll}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        <div ref={setContainerRef} className="min-w-0">
          <svg
            role="img"
            aria-label={t.latencyDecomposition}
            width={Math.max(0, containerWidth)}
            height={svgHeight}
            className="block"
          >
            {shownRows.map((row, idx) => {
              const y = idx * (ROW_HEIGHT + ROW_GAP) + ROW_GAP;
              const scale = barWidth > 0 ? barWidth / maxDuration : 0;

              const canDecompose = row.ttftMs !== null && row.ttftMs > 0 && row.durationMs > 0;
              const prefillMs = canDecompose ? row.ttftMs! : 0;
              const decodeMs = canDecompose ? Math.max(0, row.durationMs - row.ttftMs!) : 0;

              const prefillW = prefillMs * scale;
              const decodeW = decodeMs * scale;
              const undecomposedW = canDecompose ? 0 : row.durationMs * scale;

              const barX = barLeft;
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
                  {row.indent === 1 && (
                    <line
                      x1={8}
                      y1={y}
                      x2={8}
                      y2={y + ROW_HEIGHT}
                      stroke={TOKEN_SERIES_COLORS.output}
                      strokeWidth={2}
                      strokeOpacity={0.5}
                    />
                  )}

                  <text
                    x={labelX + 4}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    className="fill-current text-muted-foreground"
                    style={{
                      fontSize: px(CHART_TYPE.axisLabel),
                      fontFamily: CHART_FONT_SANS,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fitLabel(
                      `${isClickable ? (row.isExpanded ? '\u25BC ' : '\u25B6 ') : ''}${row.label}`,
                      labelFont,
                      columns.label - labelX - 4,
                    )}
                  </text>

                  <rect
                    x={barX}
                    y={y + 2}
                    width={Math.max(0, barWidth)}
                    height={ROW_HEIGHT - 4}
                    rx={3}
                    className="fill-current"
                    style={{ color: 'var(--color-border)', opacity: 0.3 }}
                  />

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

                  <text
                    x={barX + barWidth + 8}
                    y={y + ROW_HEIGHT / 2}
                    dominantBaseline="central"
                    className="fill-current text-muted-foreground"
                    style={{
                      fontSize: px(CHART_TYPE.axisLabel),
                      fontFamily: CHART_FONT_SANS,
                      fontVariantNumeric: 'tabular-nums',
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
        </div>
        <ShowMoreRows
          shown={shownRows.length}
          total={visibleRows.length}
          view="prefill-vs-decode"
          onShowMore={showMoreRows}
        />

        {tooltip && (
          <FloatingTooltip x={tooltip.x} y={tooltip.y} placement="above">
            <ChartHoverCardBody
              title={tooltip.label}
              metrics={
                tooltip.canDecompose
                  ? [
                      {
                        value: formatDuration(tooltip.prefillMs),
                        label: `${t.prefill} · ${((tooltip.prefillMs / tooltip.totalMs) * 100).toFixed(0)}%`,
                        color: COLORS.prefill,
                      },
                      {
                        value: formatDuration(tooltip.decodeMs),
                        label: `${t.decode} · ${((tooltip.decodeMs / tooltip.totalMs) * 100).toFixed(0)}%`,
                        color: COLORS.decode,
                      },
                    ]
                  : [
                      {
                        value: formatDuration(tooltip.totalMs),
                        label: t.undecomposed,
                        color: COLORS.undecomposed,
                      },
                    ]
              }
              summary={[
                `${t.e2e} ${formatDuration(tooltip.totalMs)}`,
                tooltip.tpotMs === null ? null : `TPOT ${tooltip.tpotMs.toFixed(1)} ms/tok`,
                tooltip.outputTokens > 0
                  ? `${tooltip.outputTokens.toLocaleString()} ${t.outputTokens}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </FloatingTooltip>
        )}
      </CardContent>
    </Card>
  );
}
