'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';
import { buildRequestRuns } from '@/lib/agentic-workload-explorer/subagent-runs';
import { type ContentBlock } from '@/lib/agentic-workload-explorer/subagent';
import {
  formatDollars,
  formatDuration,
  formatNumber,
} from '@/lib/agentic-workload-explorer/format';
import { TOOL_COLORS as BASE_TOOL_COLORS } from '@/lib/agentic-workload-explorer/tool-colors';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Button } from '@/components/ui/button';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { chartFont, measureTextWidth, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';
import { readableTextColor } from '@/lib/d3-chart/contrast-colors';
import { formatCost } from '@/components/agentic-workload-explorer/session-dag';

const BAR_OPACITY = 0.85;
const BAR_LABEL_PAD = 4;

const STRINGS = {
  en: {
    sectionTitle: 'Agent timeline',
    noData: 'No requests to display',
    resetZoom: 'Reset zoom',
    rows: (n: number) => `${n} row${n === 1 ? '' : 's'}`,
    agentHeader: 'Agent',
    duration: 'Duration',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    cost: 'Cost',
    requests: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    subAgentInstances: (n: number) => `${n} sub-agent instance${n === 1 ? '' : 's'}`,
    span: 'Span:',
  },
  zh: {
    sectionTitle: '智能体时间线',
    noData: '暂无请求数据',
    resetZoom: '重置缩放',
    rows: (n: number) => `${n} 行`,
    agentHeader: '智能体',
    duration: '耗时',
    input: '输入',
    output: '输出',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    cost: '成本',
    requests: (n: number) => `${n} 个请求`,
    subAgentInstances: (n: number) => `${n} 个子智能体实例`,
    span: '跨度:',
  },
} as const;

const AGENT_COLORS: Record<string, string> = {
  Main: '#6b7280',
  'Explore Agent': '#0ea5e9',
  'Code Review Agent': '#8b5cf6',
  'Plan Agent': '#f59e0b',
  'Verification Agent': '#10b981',
  'General Agent': '#94a3b8',
  'Web Search Agent': '#06b6d4',
  'Security Monitor': '#ef4444',
  'Guide Agent': '#a78bfa',
  'Title Generation': '#78716c',
  'Name Generation': '#78716c',
  'Subagent (Haiku)': '#f97316',
};

const AGENT_COLOR_DEFAULT = '#ec4899';

export function getAgentColor(label: string): string {
  return AGENT_COLORS[label] || AGENT_COLOR_DEFAULT;
}

const TOOL_COLORS: Record<string, string> = {
  ...BASE_TOOL_COLORS,
  assistant: '#6b7280',
  thinking: '#eab308',
  other: '#ec4899',
};

export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] || TOOL_COLORS.other;
}

interface TimelineBar {
  id: string;
  requestId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  model: string | null;
  tool: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  costUsd: number | null;
}

interface TimelineRow {
  id: string;
  label: string;
  agentType: string;
  bars: TimelineBar[];
  totalCost: number;
}

interface TooltipData {
  x: number;
  y: number;
  row: TimelineRow;
  bar: TimelineBar;
}

export function getDominantTool(request: SessionRequest): string {
  const responseBody = request.responseBody as {
    body?: {
      content?: ContentBlock[];
    };
  } | null;

  const content = responseBody?.body?.content;
  if (content && Array.isArray(content)) {
    const toolUse = content.find((block) => block.type === 'tool_use');
    if (toolUse && toolUse.name) return toolUse.name;

    const hasThinking = content.some((block) => block.type === 'thinking');
    if (hasThinking) {
      const hasText = content.some((block) => block.type === 'text' && block.text);
      if (!hasText) return 'thinking';
    }
  }

  return 'assistant';
}

export function buildTimelineRows(requests: SessionRequest[]): {
  rows: TimelineRow[];
  totalDurationMs: number;
} {
  if (requests.length === 0) return { rows: [], totalDurationMs: 0 };

  const sorted = [...requests].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const sessionStart = new Date(sorted[0].timestamp).getTime();

  const mainBars: TimelineBar[] = [];
  let mainCost = 0;

  const instanceCounts = new Map<string, number>();
  const subagentRows: TimelineRow[] = [];

  function makeBar(req: SessionRequest): TimelineBar {
    const startMs = new Date(req.timestamp).getTime() - sessionStart;
    const duration = req.durationMs || 0;
    return {
      id: req.id,
      requestId: req.id,
      startMs,
      endMs: startMs + duration,
      durationMs: duration,
      model: req.model,
      tool: getDominantTool(req),
      inputTokens: req.inputTokens,
      outputTokens: req.outputTokens,
      cacheRead: req.cacheReadInputTokens,
      cacheWrite: req.cacheWriteTokens,
      costUsd: req.costUsd,
    };
  }

  for (const run of buildRequestRuns(sorted)) {
    if (run.kind === 'subagent_group') {
      const count = (instanceCounts.get(run.label) || 0) + 1;
      instanceCounts.set(run.label, count);

      const bars = run.requests.map((req) => makeBar(req));
      const cost = bars.reduce((sum, b) => sum + (b.costUsd || 0), 0);

      subagentRows.push({
        id: `${run.key}-${count}`,
        label: `${run.label} #${count}`,
        agentType: run.baseLabel,
        bars,
        totalCost: cost,
      });
    } else {
      const bar = makeBar(run.req);
      mainBars.push(bar);
      mainCost += bar.costUsd || 0;
    }
  }

  const rows: TimelineRow[] = [];

  if (mainBars.length > 0) {
    rows.push({
      id: 'main',
      label: 'Main',
      agentType: 'Main',
      bars: mainBars,
      totalCost: mainCost,
    });
  }

  rows.push(...subagentRows);

  const allBars = rows.flatMap((r) => r.bars);
  const totalDurationMs = allBars.length > 0 ? Math.max(...allBars.map((b) => b.endMs)) : 0;

  return { rows, totalDurationMs };
}

export function formatTickLabel(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  return `+${(ms / 60000).toFixed(1)}m`;
}

/** Bars that overlap no other bar in their row; parallel requests would paint over a label. */
function isolatedBarIds(bars: TimelineBar[]): Set<string> {
  const sorted = bars.toSorted((a, b) => a.startMs - b.startMs);
  const ids = new Set<string>();
  let reachedMs = -Infinity;
  sorted.forEach((bar, i) => {
    const nextStart = sorted[i + 1]?.startMs ?? Infinity;
    if (bar.startMs >= reachedMs && bar.endMs <= nextStart) ids.add(bar.id);
    reachedMs = Math.max(reachedMs, bar.endMs);
  });
  return ids;
}

function pointerX(e: React.MouseEvent<SVGSVGElement>, viewWidth: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  return rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * viewWidth : 0;
}

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function TimelineTooltip({ data, t }: { data: TooltipData; t: Strings }) {
  const { row, bar } = data;
  return (
    <FloatingTooltip x={data.x} y={data.y}>
      <ChartHoverCardBody
        title={row.label}
        subtitle={bar.model ? `${bar.tool} (${bar.model})` : bar.tool}
        color={getAgentColor(row.agentType)}
        metrics={[
          {
            value: formatDuration(bar.durationMs),
            label: t.duration,
            color: getToolColor(bar.tool),
          },
        ]}
        summary={[
          bar.inputTokens !== null && bar.inputTokens > 0
            ? `${t.input} ${formatNumber(bar.inputTokens)}`
            : null,
          bar.outputTokens !== null && bar.outputTokens > 0
            ? `${t.output} ${formatNumber(bar.outputTokens)}`
            : null,
          bar.cacheRead !== null && bar.cacheRead > 0
            ? `${t.cacheRead} ${formatNumber(bar.cacheRead)}`
            : null,
          bar.cacheWrite !== null && bar.cacheWrite > 0
            ? `${t.cacheWrite} ${formatNumber(bar.cacheWrite)}`
            : null,
          bar.costUsd !== null && bar.costUsd > 0
            ? `${t.cost} ${formatDollars(bar.costUsd)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
    </FloatingTooltip>
  );
}

export function AgentTimeline({ requests }: { requests: SessionRequest[] }) {
  const t = STRINGS[useLocale()];
  const explorerHref = useExplorerHref();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const router = useRouter();
  const params = useParams();

  const { rows, totalDurationMs } = useMemo(() => buildTimelineRows(requests), [requests]);

  const [viewStart, setViewStart] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startViewStart: number; startViewEnd: number } | null>(
    null,
  );

  const LABEL_WIDTH = dimensions.width > 0 && dimensions.width < 640 ? 96 : 180;
  const ROW_HEIGHT = 32;
  const ROW_GAP = 4;
  const HEADER_HEIGHT = 28;
  const PADDING_RIGHT = 20;
  const MIN_BAR_WIDTH = 4;

  const chartWidth = Math.max(200, dimensions.width - LABEL_WIDTH - 2);
  const svgHeight = HEADER_HEIGHT + rows.length * (ROW_HEIGHT + ROW_GAP) + 8;

  const vStart = viewStart;
  const vEnd = viewEnd ?? totalDurationMs;
  const visibleDuration = Math.max(vEnd - vStart, 1);
  const scale = (chartWidth - PADDING_RIGHT) / visibleDuration;
  const isZoomed = viewEnd !== null;

  const tickCount = Math.min(10, Math.max(4, Math.floor(chartWidth / 80)));
  const tickIntervalMs = visibleDuration / tickCount;
  const niceIntervals = [
    100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000,
  ];
  const niceInterval = niceIntervals.find((n) => n >= tickIntervalMs) || tickIntervalMs;
  const ticks: number[] = [];
  const tickStart = Math.floor(vStart / niceInterval) * niceInterval;
  for (let tv = tickStart; tv <= vEnd; tv += niceInterval) {
    if (tv >= vStart) ticks.push(tv);
  }

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const mouseRatio = pointerX(e, chartWidth) / (chartWidth - PADDING_RIGHT);
      const curStart = viewStart;
      const curEnd = viewEnd ?? totalDurationMs;
      const curDuration = curEnd - curStart;

      const zoomFactor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const newDuration = Math.min(Math.max(curDuration * zoomFactor, 100), totalDurationMs);

      const pivot = curStart + mouseRatio * curDuration;
      let newStart = pivot - mouseRatio * newDuration;
      let newEnd = pivot + (1 - mouseRatio) * newDuration;

      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > totalDurationMs) {
        newStart -= newEnd - totalDurationMs;
        newEnd = totalDurationMs;
        if (newStart < 0) newStart = 0;
      }

      if (newEnd - newStart >= totalDurationMs * 0.99) {
        setViewStart(0);
        setViewEnd(null);
      } else {
        setViewStart(newStart);
        setViewEnd(newEnd);
      }
    },
    [viewStart, viewEnd, totalDurationMs, chartWidth, PADDING_RIGHT],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      dragRef.current = {
        startX: pointerX(e, chartWidth),
        startViewStart: viewStart,
        startViewEnd: viewEnd ?? totalDurationMs,
      };
    },
    [viewStart, viewEnd, totalDurationMs, chartWidth],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragRef.current) {
        setHoverX(pointerX(e, chartWidth));
        return;
      }
      setHoverX(null);
      const dx = pointerX(e, chartWidth) - dragRef.current.startX;
      const msPx = visibleDuration / (chartWidth - PADDING_RIGHT);
      const deltaMs = -dx * msPx;

      let newStart = dragRef.current.startViewStart + deltaMs;
      let newEnd = dragRef.current.startViewEnd + deltaMs;
      const dur = newEnd - newStart;

      if (newStart < 0) {
        newStart = 0;
        newEnd = dur;
      }
      if (newEnd > totalDurationMs) {
        newEnd = totalDurationMs;
        newStart = totalDurationMs - dur;
        if (newStart < 0) newStart = 0;
      }

      setViewStart(newStart);
      setViewEnd(newEnd);
      setTooltip(null);
    },
    [visibleDuration, chartWidth, PADDING_RIGHT, totalDurationMs],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current = null;
    setHoverX(null);
  }, []);

  const resetZoom = useCallback(() => {
    setViewStart(0);
    setViewEnd(null);
  }, []);

  const uniqueTypes = [...new Set(rows.map((r) => r.agentType))];
  const barTextColors = useMemo(
    () =>
      new Map(
        rows.map((r) => [r.agentType, readableTextColor(getAgentColor(r.agentType), BAR_OPACITY)]),
      ),
    [rows],
  );
  const isolatedBars = useMemo(() => rows.map((r) => isolatedBarIds(r.bars)), [rows]);

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);

  const chartId = `agent-timeline-${useId().replaceAll(/[^a-zA-Z0-9_-]/gu, '')}`;
  useFontsVersion();

  if (rows.length === 0) {
    return <EmptyState className="h-32">{t.noData}</EmptyState>;
  }

  const barFont = chartFont(CHART_TYPE.axisLabelSub);

  return (
    <Card id={chartId}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0 grow basis-48">
            <CardTitle>{t.sectionTitle}</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">{t.rows(rows.length)}</div>
          </div>
          <ChartButtons
            chartId={chartId}
            exportFileName={`agent-timeline-${params.id || 'session'}`}
            hideZoomReset
            onExportPng={() => track('agentic_workload_timeline_export_png')}
            leadingControls={
              isZoomed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    resetZoom();
                    track('agentic_workload_timeline_zoom_reset');
                  }}
                >
                  {t.resetZoom}
                </Button>
              ) : undefined
            }
            className="mb-0 ml-auto shrink-0 flex-nowrap"
          />
        </div>
      </CardHeader>
      <CardContent ref={setContainerRef} className="space-y-3">
        <div className="max-h-0 overflow-hidden" aria-hidden="true">
          <div id={`${chartId}-export`} className="p-4" />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {uniqueTypes.map((agentType) => (
            <div key={agentType} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: getAgentColor(agentType) }}
              />
              <span className="text-xs text-muted-foreground">{agentType}</span>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-border/30">
          <div className="flex">
            <div
              className="flex-shrink-0 border-r border-border/20 bg-card"
              style={{ width: LABEL_WIDTH }}
            >
              <div
                className="border-b border-border/20 flex items-end px-2 pb-1"
                style={{ height: HEADER_HEIGHT }}
              >
                <span className="text-xs font-medium text-muted-foreground">{t.agentHeader}</span>
              </div>
              {rows.map((row) => {
                const color = getAgentColor(row.agentType);
                return (
                  <div
                    key={row.id}
                    className="flex items-center px-2 gap-1.5 overflow-hidden"
                    style={{ height: ROW_HEIGHT + ROW_GAP }}
                  >
                    <span
                      className="inline-block w-1.5 h-3.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className="text-xs truncate font-medium text-foreground"
                      title={row.label}
                    >
                      {LABEL_WIDTH < 180 ? row.label.replace(/^.*? · /u, '') : row.label}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground ml-auto shrink-0">
                      {row.bars.length}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden" data-chart-scroll>
              <svg
                role="img"
                aria-label={t.sectionTitle}
                width="100%"
                height={svgHeight}
                viewBox={`0 0 ${chartWidth} ${svgHeight}`}
                preserveAspectRatio="none"
                className="block"
                style={{ cursor: isZoomed ? 'grab' : undefined }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
              >
                <rect
                  x={0}
                  y={0}
                  width={chartWidth}
                  height={HEADER_HEIGHT}
                  className="fill-surface"
                />
                <line
                  x1={0}
                  y1={HEADER_HEIGHT}
                  x2={chartWidth}
                  y2={HEADER_HEIGHT}
                  className="stroke-border"
                  strokeWidth={1}
                />

                {ticks.map((tick) => {
                  const x = (tick - vStart) * scale;
                  return (
                    <g key={tick}>
                      <line
                        x1={x}
                        y1={HEADER_HEIGHT}
                        x2={x}
                        y2={svgHeight}
                        stroke="var(--chart-grid)"
                        strokeWidth={1}
                      />
                      <text
                        x={x + 3}
                        y={HEADER_HEIGHT - 6}
                        className="fill-muted-foreground"
                        style={{
                          fontSize: px(CHART_TYPE.axisLabel),
                          fontFamily: CHART_FONT_SANS,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {tick === 0 ? '0' : formatTickLabel(tick)}
                      </text>
                    </g>
                  );
                })}

                {rows.map((_, rowIdx) => (
                  <rect
                    key={`row-bg-${rowIdx}`}
                    x={0}
                    y={HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP)}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill={rowIdx % 2 === 1 ? 'currentColor' : 'transparent'}
                    className="text-border"
                    opacity={rowIdx % 2 === 1 ? 0.05 : 0}
                  />
                ))}

                {rows.map((_, rowIdx) => {
                  if (rowIdx === 0) return null;
                  const y = HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP) - ROW_GAP / 2;
                  return (
                    <line
                      key={`row-sep-${rowIdx}`}
                      x1={0}
                      y1={y}
                      x2={chartWidth}
                      y2={y}
                      stroke="currentColor"
                      className="text-border"
                      strokeWidth={0.5}
                      opacity={0.3}
                    />
                  );
                })}

                {rows.map((row, rowIdx) =>
                  row.bars.map((bar) => {
                    const x = (bar.startMs - vStart) * scale;
                    const barWidth = Math.max(bar.durationMs * scale, MIN_BAR_WIDTH);
                    const y = HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP) + 4;
                    const barHeight = ROW_HEIGHT - 8;
                    const color = getAgentColor(row.agentType);
                    const toolColor = getToolColor(bar.tool);
                    const textColor = barTextColors.get(row.agentType);
                    const durationLabel = formatDuration(bar.durationMs);
                    const durationWidth = measureTextWidth(durationLabel, barFont);
                    const showDuration =
                      isolatedBars[rowIdx].has(bar.id) && durationWidth + BAR_LABEL_PAD <= barWidth;
                    const showTool =
                      showDuration &&
                      measureTextWidth(bar.tool, barFont) + durationWidth + BAR_LABEL_PAD * 3 <=
                        barWidth;
                    const labelY = y + (barHeight - 3) / 2 + 1;

                    return (
                      <g
                        key={bar.id}
                        onMouseMove={(e) =>
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            row,
                            bar,
                          })
                        }
                        onMouseLeave={() => setTooltip(null)}
                        onClick={() =>
                          router.push(
                            explorerHref(
                              `/sessions/${params.id}/conversation#req-${bar.requestId}`,
                            ),
                          )
                        }
                        className="cursor-pointer"
                      >
                        <rect
                          x={x - 1}
                          y={HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP)}
                          width={barWidth + 2}
                          height={ROW_HEIGHT}
                          fill="transparent"
                          className="hover:fill-surface-hover/50"
                          rx={2}
                        />
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx={2}
                          fill={color}
                          opacity={BAR_OPACITY}
                        />
                        <rect
                          x={x}
                          y={y + barHeight - 3}
                          width={barWidth}
                          height={3}
                          rx={1}
                          fill={toolColor}
                          opacity={0.7}
                        />
                        {showDuration && (
                          <text
                            x={showTool ? x + barWidth - BAR_LABEL_PAD : x + barWidth / 2}
                            y={labelY}
                            textAnchor={showTool ? 'end' : 'middle'}
                            dominantBaseline="middle"
                            fill={textColor}
                            pointerEvents="none"
                            style={{
                              fontSize: px(CHART_TYPE.axisLabelSub),
                              fontFamily: CHART_FONT_SANS,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {durationLabel}
                          </text>
                        )}
                        {showTool && (
                          <text
                            x={x + BAR_LABEL_PAD}
                            y={labelY}
                            dominantBaseline="middle"
                            fill={textColor}
                            pointerEvents="none"
                            style={{
                              fontSize: px(CHART_TYPE.axisLabelSub),
                              fontFamily: CHART_FONT_SANS,
                            }}
                          >
                            {bar.tool}
                          </text>
                        )}
                      </g>
                    );
                  }),
                )}
                {hoverX !== null && (
                  <g pointerEvents="none">
                    <line
                      x1={hoverX}
                      y1={HEADER_HEIGHT}
                      x2={hoverX}
                      y2={svgHeight}
                      className="stroke-foreground"
                      strokeOpacity={0.4}
                      strokeWidth={1}
                    />
                    <text
                      x={Math.min(hoverX + 3, chartWidth - 40)}
                      y={HEADER_HEIGHT - 6}
                      className="fill-foreground"
                      style={{
                        fontSize: px(CHART_TYPE.axisLabel),
                        fontFamily: CHART_FONT_SANS,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatTickLabel(vStart + hoverX / scale)}
                    </text>
                  </g>
                )}
              </svg>
            </div>
          </div>
        </div>

        <div className="px-1 text-xs tabular-nums text-muted-foreground">
          {[
            t.requests(rows.reduce((s, r) => s + r.bars.length, 0)),
            t.subAgentInstances(rows.length - (rows[0]?.agentType === 'Main' ? 1 : 0)),
            `${t.span} ${formatDuration(totalDurationMs)}`,
            totalCost > 0 ? formatCost(totalCost) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>

        {tooltip && <TimelineTooltip data={tooltip} t={t} />}
      </CardContent>
    </Card>
  );
}
