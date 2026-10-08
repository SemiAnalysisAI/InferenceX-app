'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';
import { buildRequestRuns } from '@/lib/agentic-workload-explorer/subagent-runs';
import { type ContentBlock } from '@/lib/agentic-workload-explorer/subagent';
import { formatDuration, formatNumber } from '@/lib/agentic-workload-explorer/format';
import { TOOL_COLORS as BASE_TOOL_COLORS } from '@/lib/agentic-workload-explorer/tool-colors';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    sectionTitle: 'Agent Timeline',
    noData: 'No requests to display',
    resetZoom: 'Reset Zoom',
    exportPng: 'Export PNG',
    rows: (n: number) => `${n} row${n === 1 ? '' : 's'}`,
    agentHeader: 'Agent',
    duration: 'Duration',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache Read',
    cacheWrite: 'Cache Write',
    cost: 'Cost',
    requests: (n: number) => `${n} request${n === 1 ? '' : 's'}`,
    subAgentInstances: (n: number) => `${n} sub-agent instance${n === 1 ? '' : 's'}`,
    span: 'Span:',
  },
  zh: {
    sectionTitle: '智能体时间线',
    noData: '暂无请求数据',
    resetZoom: '重置缩放',
    exportPng: '导出 PNG',
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

// ── Agent color palette ──────────────────────────────────────────

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

/** @visibleForTesting */
export function getAgentColor(label: string): string {
  return AGENT_COLORS[label] || AGENT_COLOR_DEFAULT;
}

// ── Tool colors ───────────────────────────────────────────────────

// Canonical per-tool palette plus the timeline-only bar kinds.
const TOOL_COLORS: Record<string, string> = {
  ...BASE_TOOL_COLORS,
  assistant: '#6b7280',
  thinking: '#eab308',
  other: '#ec4899',
};

/** @visibleForTesting */
export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] || TOOL_COLORS.other;
}

// ── Types ─────────────────────────────────────────────────────────

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
  label: string; // "Main", "Explore Agent #1", etc.
  agentType: string; // "Main", "Explore Agent", etc. (for color)
  bars: TimelineBar[];
  totalCost: number;
}

interface TooltipData {
  x: number;
  y: number;
  row: TimelineRow;
  bar: TimelineBar;
}

// ── Extract dominant tool from response ───────────────────────────

/** @visibleForTesting */
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

// ── Build timeline rows ───────────────────────────────────────────
// Main agent requests are collected into a single "Main" row.

/** @visibleForTesting */
export function buildTimelineRows(requests: SessionRequest[]): {
  rows: TimelineRow[];
  totalDurationMs: number;
} {
  if (requests.length === 0) return { rows: [], totalDurationMs: 0 };

  const sorted = [...requests].toSorted(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const sessionStart = new Date(sorted[0].timestamp).getTime();

  // Main agent row collects all main requests
  const mainBars: TimelineBar[] = [];
  let mainCost = 0;

  // Track instance counts per agent type for numbering
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
      // Main agent request
      const bar = makeBar(run.req);
      mainBars.push(bar);
      mainCost += bar.costUsd || 0;
    }
  }

  // Build final rows: Main first, then sub-agents in order of appearance
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

  // Total duration
  const allBars = rows.flatMap((r) => r.bars);
  const totalDurationMs = allBars.length > 0 ? Math.max(...allBars.map((b) => b.endMs)) : 0;

  return { rows, totalDurationMs };
}

// ── Helpers ───────────────────────────────────────────────────────

/** @visibleForTesting */
export function formatTickLabel(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  return `+${(ms / 60000).toFixed(1)}m`;
}

// ── Tooltip component ─────────────────────────────────────────────

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

function TimelineTooltip({ data, t }: { data: TooltipData; t: Strings }) {
  const { row, bar } = data;
  return (
    <div
      className="fixed z-50 pointer-events-none rounded-md border border-border bg-surface p-2.5 shadow-lg"
      style={{ left: data.x + 12, top: data.y - 10 }}
    >
      <div className="space-y-1 text-2xs font-mono">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{
              backgroundColor: getAgentColor(row.agentType),
            }}
          />
          <span className="font-bold text-foreground">{row.label}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block w-1.5 h-1.5 rounded-sm"
            style={{ backgroundColor: getToolColor(bar.tool) }}
          />
          <span>{bar.tool}</span>
          {bar.model && <span className="text-subtle">({bar.model})</span>}
        </div>
        <div className="h-px bg-border my-1" />
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t.duration}</span>
          <span>{formatDuration(bar.durationMs)}</span>
        </div>
        {bar.inputTokens !== null && bar.inputTokens > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t.input}</span>
            <span>{formatNumber(bar.inputTokens)}</span>
          </div>
        )}
        {bar.outputTokens !== null && bar.outputTokens > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t.output}</span>
            <span>{formatNumber(bar.outputTokens)}</span>
          </div>
        )}
        {bar.cacheRead !== null && bar.cacheRead > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t.cacheRead}</span>
            <span>{formatNumber(bar.cacheRead)}</span>
          </div>
        )}
        {bar.cacheWrite !== null && bar.cacheWrite > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t.cacheWrite}</span>
            <span>{formatNumber(bar.cacheWrite)}</span>
          </div>
        )}
        {bar.costUsd !== null && bar.costUsd > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t.cost}</span>
            <span>${bar.costUsd.toFixed(4)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function AgentTimeline({ requests }: { requests: SessionRequest[] }) {
  const t = STRINGS[useLocale()];
  const explorerHref = useExplorerHref();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useParams();

  const { rows, totalDurationMs } = useMemo(() => buildTimelineRows(requests), [requests]);

  // Zoom & pan state: visible time window in ms
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState<number | null>(null); // null = full range
  const dragRef = useRef<{ startX: number; startViewStart: number; startViewEnd: number } | null>(
    null,
  );

  // ── Layout constants ────────────────────────────────────────────
  const LABEL_WIDTH = 180;
  const ROW_HEIGHT = 32;
  const ROW_GAP = 4;
  const HEADER_HEIGHT = 28;
  const PADDING_RIGHT = 20;
  const MIN_BAR_WIDTH = 4;

  const chartWidth = Math.max(600, 800);
  const svgHeight = HEADER_HEIGHT + rows.length * (ROW_HEIGHT + ROW_GAP) + 8;

  // Zoom/pan: compute visible range
  const vStart = viewStart;
  const vEnd = viewEnd ?? totalDurationMs;
  const visibleDuration = Math.max(vEnd - vStart, 1);
  const scale = (chartWidth - PADDING_RIGHT) / visibleDuration;
  const isZoomed = viewEnd !== null;

  // Time axis ticks (based on visible range)
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

  // Zoom handler: scroll wheel zooms around cursor position
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseRatio = mouseX / (chartWidth - PADDING_RIGHT);
      const curStart = viewStart;
      const curEnd = viewEnd ?? totalDurationMs;
      const curDuration = curEnd - curStart;

      const zoomFactor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const newDuration = Math.min(Math.max(curDuration * zoomFactor, 100), totalDurationMs);

      const pivot = curStart + mouseRatio * curDuration;
      let newStart = pivot - mouseRatio * newDuration;
      let newEnd = pivot + (1 - mouseRatio) * newDuration;

      // Clamp
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

  // Pan handlers: drag to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      dragRef.current = {
        startX: e.clientX,
        startViewStart: viewStart,
        startViewEnd: viewEnd ?? totalDurationMs,
      };
    },
    [viewStart, viewEnd, totalDurationMs],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
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

  const resetZoom = useCallback(() => {
    setViewStart(0);
    setViewEnd(null);
  }, []);

  // Unique agent types for legend
  const uniqueTypes = [...new Set(rows.map((r) => r.agentType))];

  // Total cost
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);

  // ── Export to PNG ─────────────────────────────────────────────
  const exportToPng = useCallback(() => {
    const container = chartRef.current;
    if (!container) return;

    const dpr = window.devicePixelRatio || 2;
    const totalWidth = LABEL_WIDTH + chartWidth;
    const totalHeight = svgHeight;

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Background
    const isMinecraft = document.documentElement.classList.contains('minecraft');
    const darkLike = isMinecraft;
    ctx.fillStyle = isMinecraft ? '#1e1e1e' : '#fafafa';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Draw label column background
    ctx.fillStyle = darkLike ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
    ctx.fillRect(0, 0, LABEL_WIDTH, totalHeight);

    // Label column border
    ctx.strokeStyle = darkLike ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, 0);
    ctx.lineTo(LABEL_WIDTH, totalHeight);
    ctx.stroke();

    // Header text
    ctx.font = '600 9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = darkLike ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    ctx.fillText('AGENT', 8, HEADER_HEIGHT - 8);

    // Header border
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(totalWidth, HEADER_HEIGHT);
    ctx.stroke();

    // Row labels
    ctx.font = '500 10px ui-monospace, SFMono-Regular, monospace';
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const y = HEADER_HEIGHT + ri * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2 + 4;
      const color = getAgentColor(row.agentType);

      // Color bar
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(8, y - 10, 3, 14, 1);
      ctx.fill();

      // Label text
      ctx.fillStyle = color;
      const label = row.label.length > 22 ? `${row.label.slice(0, 20)}...` : row.label;
      ctx.fillText(label, 16, y);

      // Count
      ctx.fillStyle = darkLike ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
      ctx.font = '400 9px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(String(row.bars.length), LABEL_WIDTH - 16, y);
      ctx.font = '500 10px ui-monospace, SFMono-Regular, monospace';
    }

    // Draw the SVG portion onto canvas
    const svg = container.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.addEventListener('load', () => {
      ctx.drawImage(img, LABEL_WIDTH, 0, chartWidth, svgHeight);
      URL.revokeObjectURL(url);

      // Download
      const link = document.createElement('a');
      link.download = `agent-timeline-${params.id || 'session'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    img.src = url;
  }, [rows, chartWidth, svgHeight, LABEL_WIDTH, HEADER_HEIGHT, ROW_HEIGHT, ROW_GAP, params.id]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs font-mono">
        {t.noData}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.sectionTitle}
        </span>
        <div className="flex-1 h-px bg-border" />
        {isZoomed && (
          <button
            onClick={() => {
              resetZoom();
              track('agentic_workload_timeline_zoom_reset');
            }}
            className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
          >
            {t.resetZoom}
          </button>
        )}
        <button
          onClick={() => {
            exportToPng();
            track('agentic_workload_timeline_export_png');
          }}
          className="text-3xs font-mono text-subtle hover:text-foreground px-1.5 py-0.5 border border-border rounded hover:bg-surface-hover transition-colors"
        >
          {t.exportPng}
        </button>
        <span className="text-3xs font-mono text-muted-foreground">{t.rows(rows.length)}</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {uniqueTypes.map((agentType) => (
          <div key={agentType} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: getAgentColor(agentType) }}
            />
            <span className="text-3xs font-mono text-muted-foreground">{agentType}</span>
          </div>
        ))}
      </div>

      {/* Chart container */}
      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <div className="flex">
          {/* Fixed left labels — one per row */}
          <div
            className="flex-shrink-0 border-r border-border bg-surface"
            style={{ width: LABEL_WIDTH }}
          >
            <div
              className="border-b border-border flex items-end px-2 pb-1"
              style={{ height: HEADER_HEIGHT }}
            >
              <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                {t.agentHeader}
              </span>
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
                  <span className="text-3xs font-mono truncate font-medium" style={{ color }}>
                    {row.label}
                  </span>
                  <span className="text-3xs font-mono text-subtle ml-auto shrink-0">
                    {row.bars.length}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable SVG chart */}
          <div className="flex-1 overflow-x-auto" ref={chartRef}>
            <svg
              width={chartWidth}
              height={svgHeight}
              className="block"
              style={{ cursor: isZoomed ? 'grab' : undefined }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Header background */}
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

              {/* Time axis ticks */}
              {ticks.map((tick) => {
                const x = (tick - vStart) * scale;
                return (
                  <g key={tick}>
                    <line
                      x1={x}
                      y1={HEADER_HEIGHT}
                      x2={x}
                      y2={svgHeight}
                      stroke="currentColor"
                      className="text-border"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                    />
                    <text
                      x={x + 3}
                      y={HEADER_HEIGHT - 6}
                      className="fill-muted-foreground"
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      }}
                    >
                      {formatTickLabel(tick)}
                    </text>
                  </g>
                );
              })}

              {/* Row background stripes */}
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

              {/* Row separator lines */}
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

              {/* Timeline bars */}
              {rows.map((row, rowIdx) =>
                row.bars.map((bar) => {
                  const x = (bar.startMs - vStart) * scale;
                  const barWidth = Math.max(bar.durationMs * scale, MIN_BAR_WIDTH);
                  const y = HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP) + 4;
                  const barHeight = ROW_HEIGHT - 8;
                  const color = getAgentColor(row.agentType);
                  const toolColor = getToolColor(bar.tool);

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
                          explorerHref(`/sessions/${params.id}/conversation#req-${bar.requestId}`),
                        )
                      }
                      className="cursor-pointer"
                    >
                      {/* Hover area */}
                      <rect
                        x={x - 1}
                        y={HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP)}
                        width={barWidth + 2}
                        height={ROW_HEIGHT}
                        fill="transparent"
                        className="hover:fill-surface-hover/50"
                        rx={2}
                      />
                      {/* Main bar (agent color) */}
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={2}
                        fill={color}
                        opacity={0.85}
                      />
                      {/* Tool color accent strip at bottom */}
                      <rect
                        x={x}
                        y={y + barHeight - 3}
                        width={barWidth}
                        height={3}
                        rx={1}
                        fill={toolColor}
                        opacity={0.7}
                      />
                      {/* Duration text inside bar */}
                      {barWidth > 50 && (
                        <text
                          x={x + barWidth / 2}
                          y={y + (barHeight - 3) / 2 + 1}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          }}
                        >
                          {formatDuration(bar.durationMs)}
                        </text>
                      )}
                      {/* Tool name if enough space */}
                      {barWidth > 90 && (
                        <text
                          x={x + 5}
                          y={y + (barHeight - 3) / 2 + 1}
                          dominantBaseline="middle"
                          fill="white"
                          opacity={0.7}
                          style={{
                            fontSize: '8px',
                            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          }}
                        >
                          {bar.tool}
                        </text>
                      )}
                    </g>
                  );
                }),
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-2xs font-mono text-muted-foreground px-1">
        <span>{t.requests(rows.reduce((s, r) => s + r.bars.length, 0))}</span>
        <span className="h-px w-3 bg-border" />
        <span>{t.subAgentInstances(rows.length - (rows[0]?.agentType === 'Main' ? 1 : 0))}</span>
        <span className="h-px w-3 bg-border" />
        <span>
          {t.span} {formatDuration(totalDurationMs)}
        </span>
        {totalCost > 0 && (
          <>
            <span className="h-px w-3 bg-border" />
            <span className="text-emerald-500">
              ${totalCost < 0.01 ? '<0.01' : totalCost.toFixed(3)}
            </span>
          </>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && <TimelineTooltip data={tooltip} t={t} />}
    </div>
  );
}
