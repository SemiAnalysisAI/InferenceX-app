'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { type RequestRecord, type RequestTimeline } from '@/hooks/api/use-request-timeline';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';

import { sliceTimelineByPhase } from './phase-slice';
import { TimelineBars } from './timeline-bars';
import { formatDuration } from './timeline-format';
import {
  CHART_WIDTH,
  HEADER_HEIGHT,
  LABEL_WIDTH,
  PADDING_RIGHT,
  ROW_GAP,
  ROW_HEIGHT,
  TIMELINE_BODY_MAX_HEIGHT,
  timelineSvgHeight,
} from './timeline-layout';
import {
  buildRequestTimelineRows,
  computeStableRowIndex,
  conversationHref,
  requestIdleStats,
  type RequestTimelineRow,
  type RowMode,
} from './timeline-rows';
import type { SortedRequestTimes } from './timeline-cursor-stats';
import {
  consumeTimelineViewSnapshot,
  saveTimelineViewSnapshot,
  type PhaseFilter,
} from './timeline-view-snapshot';
import {
  CursorPopover,
  TimelineTooltip,
  type CursorState,
  type TooltipData,
} from './timeline-tooltips';

// Stable public API: pure helpers and types live in focused modules, but
// external consumers (detail page, tests) import them from here.
export {
  buildRequestTimelineRows,
  computeStableRowIndex,
  conversationHref,
  datasetConvId,
  requestIdleStats,
  splitTimelineCid,
  subagentIdOf,
} from './timeline-rows';
export type { RequestIdleStats, RequestTimelineRow } from './timeline-rows';
export { parseTimelineViewSnapshot } from './timeline-view-snapshot';
export type { TimelineViewSnapshot } from './timeline-view-snapshot';

/**
 * Gantt-style request timeline for one agentic benchmark point.
 *
 * Rows are conversations (or workers — toggle in the header). Bars are
 * individual HTTP requests, drawn from request_start to request_end with a
 * thin lead-in segment from credit_issued (load gen queue). Shift+scroll
 * zooms, drag pans, hover shows per-request stats.
 *
 * The reference for this layout is the agent-timeline in semianalysis-claude-code-proxy.
 */

const ROW_MODE_OPTIONS: SegmentedToggleOption<RowMode>[] = [
  { value: 'conversation', label: 'By conversation', testId: 'timeline-mode-conversation' },
  { value: 'worker', label: 'By worker', testId: 'timeline-mode-worker' },
];

const PHASE_OPTIONS: SegmentedToggleOption<PhaseFilter>[] = [
  { value: 'profiling', label: 'Profiling', testId: 'timeline-phase-profiling' },
  { value: 'warmup', label: 'Warmup', testId: 'timeline-phase-warmup' },
];

const PLOT_WIDTH = CHART_WIDTH - PADDING_RIGHT;

export function RequestTimelineView({
  data,
  datasetSlug,
  pointId,
}: {
  data: RequestTimeline;
  /** Source dataset slug for this run; enables click-to-conversation deep links. */
  datasetSlug?: string | null;
  /** benchmark_results.id — keys the per-point view-state snapshot for restore. */
  pointId: number;
}) {
  const router = useRouter();
  const [rowMode, setRowMode] = useState<RowMode>('conversation');
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('profiling');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // The scroll container (vertical row scroll + horizontal chart scroll) and a
  // ref mirror of the live view state, so click-through can snapshot the exact
  // position without rebuilding openConversation on every zoom/pan tick.
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveStateRef = useRef<{
    viewStart: number;
    viewEnd: number | null;
    rowMode: RowMode;
    phaseFilter: PhaseFilter;
    expandedSubagents: ReadonlySet<string>;
  }>({
    viewStart: 0,
    viewEnd: null,
    rowMode: 'conversation',
    phaseFilter: 'profiling',
    expandedSubagents: new Set(),
  });

  const openConversation = useCallback(
    (req: RequestRecord) => {
      if (!datasetSlug) return;
      // Snapshot the current zoom/scroll/filter position so the browser back
      // button restores it (see the restore effect below).
      if (scrollRef.current) {
        const live = liveStateRef.current;
        saveTimelineViewSnapshot(pointId, {
          viewStart: live.viewStart,
          viewEnd: live.viewEnd,
          rowMode: live.rowMode,
          phaseFilter: live.phaseFilter,
          expanded: [...live.expandedSubagents],
          scrollTop: scrollRef.current.scrollTop,
          scrollLeft: scrollRef.current.scrollLeft,
        });
      }
      track('agentic_timeline_to_dataset', { slug: datasetSlug });
      router.push(conversationHref(datasetSlug, req));
    },
    [datasetSlug, router, pointId],
  );
  // Which multi-stream subagents currently have their per-stream rows
  // expanded. Key is the subagent row's `key` (parent_cid::sa:agent_id).
  const [expandedSubagents, setExpandedSubagents] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSubagent = useCallback((key: string) => {
    setExpandedSubagents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const dragRef = useRef<{ startX: number; vs: number; ve: number } | null>(null);

  // The phase toggle only means something when warmup requests are actually
  // present. aiperf's profile_export only contains profiling-phase requests, so
  // in practice every record is `profiling` and the toggle is a no-op — hide it
  // unless a non-profiling request exists (keeps it working if warmup is ever
  // exported).
  const hasWarmup = useMemo(
    () => data.requests.some((r) => r.phase !== 'profiling'),
    [data.requests],
  );

  // Apply phase filter, then group into rows. Uses the SAME time-boundary
  // slicing as the per-point charts (sliceTimelineByPhase) rather than the
  // per-request phase LABEL, so the Gantt and the charts agree on exactly which
  // requests belong to each phase (they diverge only when a warmup-labelled
  // request starts after the first profiling request). With no warmup data the
  // boundary is null and this is an identity passthrough — the filter collapses
  // to "profiling" regardless of the (hidden) toggle state.
  const filtered = useMemo(
    () => sliceTimelineByPhase(data, hasWarmup ? phaseFilter : 'profiling').requests,
    [data, phaseFilter, hasWarmup],
  );
  // Stable order/color per conversation (or worker), computed over the FULL
  // request set — NOT the phase-filtered subset — so a row keeps its position
  // and color when the user toggles between warmup and profiling.
  const stableRowIndex = useMemo(
    () => computeStableRowIndex(data.requests, rowMode),
    [data.requests, rowMode],
  );
  const rows = useMemo(
    () => buildRequestTimelineRows(filtered, rowMode, expandedSubagents, stableRowIndex),
    [filtered, rowMode, expandedSubagents, stableRowIndex],
  );
  const idleStats = useMemo(() => requestIdleStats(filtered), [filtered]);

  // Pre-sort the timestamp columns so the cursor-time stats popover can
  // count "running / waiting at time t" in O(log n). With a few hundred
  // requests this is overkill — but it stays smooth on huge runs too.
  const sortedTimes = useMemo<SortedRequestTimes>(() => {
    const credits = filtered.map((r) => r.credit).toSorted((a, b) => a - b);
    const starts = filtered.map((r) => r.start).toSorted((a, b) => a - b);
    const ends = filtered.map((r) => r.end).toSorted((a, b) => a - b);
    return { credits, starts, ends };
  }, [filtered]);

  // Cursor state (vertical line + stats popover). null when the mouse
  // isn't over the chart. xPx is svg-local; tNs is the ns offset from
  // dataStart that the cursor is pointing at.
  const [cursor, setCursor] = useState<CursorState | null>(null);

  // Timeline extent (clamped to actual data — if we filtered out warmup
  // the visible window should shrink to just the profiling phase).
  const { dataStart, dataEnd } = useMemo(() => {
    if (filtered.length === 0) return { dataStart: 0, dataEnd: 1 };
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const r of filtered) {
      if (r.credit < min) min = r.credit;
      if (r.end > max) max = r.end;
    }
    return { dataStart: min, dataEnd: max };
  }, [filtered]);
  const totalNs = Math.max(dataEnd - dataStart, 1);

  // Visible window state (ns offsets, relative to dataStart).
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const vStart = viewStart;
  const vEnd = viewEnd ?? totalNs;
  const visibleDur = Math.max(vEnd - vStart, 1);
  const isZoomed = viewEnd !== null;

  // Mirror the live view state into a ref so the click-through snapshot reads
  // the latest values without rebuilding openConversation on every zoom tick.
  liveStateRef.current = { viewStart, viewEnd, rowMode, phaseFilter, expandedSubagents };

  // Restore the snapshot written on click-through (e.g. open a request in the
  // dataset flamegraph, then hit the browser back button). Runs once per mount,
  // keyed by point id; the snapshot is consumed so a later reload starts fresh.
  // Scroll is applied after the restored filters/expansions re-render the rows
  // (rAF fires after that synchronous commit, before paint — no visible jump).
  useLayoutEffect(() => {
    const snapshot = consumeTimelineViewSnapshot(pointId);
    if (!snapshot) return;
    setRowMode(snapshot.rowMode);
    setPhaseFilter(snapshot.phaseFilter);
    setExpandedSubagents(new Set(snapshot.expanded));
    setViewStart(snapshot.viewStart);
    setViewEnd(snapshot.viewEnd);
    const target = { top: snapshot.scrollTop, left: snapshot.scrollLeft };
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = target.top;
      el.scrollLeft = target.left;
    });
    // setState setters are stable; only re-run if the point itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointId]);

  const svgHeight = timelineSvgHeight(rows.length);

  // Native (non-passive) wheel handler: React's synthetic onWheel is attached
  // passively, so preventDefault there is silently ignored and shift+scroll
  // would zoom AND horizontally pan the scroll container.
  const zoomSvgRef = useRef<SVGSVGElement | null>(null);
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Zoom only on shift+scroll so plain scrolling keeps its native meaning
      // (page / row-container scroll) instead of being hijacked by the chart.
      if (!e.shiftKey) return;
      e.preventDefault();
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseRatio = Math.max(0, Math.min(1, mouseX / PLOT_WIDTH));
      const curStart = vStart;
      const curEnd = vEnd;
      const curDur = curEnd - curStart;
      // With shift held, most browsers report the wheel delta on deltaX.
      const delta = e.deltaY || e.deltaX;
      const factor = delta > 0 ? 1.2 : 1 / 1.2;
      const newDur = Math.min(Math.max(curDur * factor, totalNs * 0.001), totalNs);
      const pivot = curStart + mouseRatio * curDur;
      let newStart = pivot - mouseRatio * newDur;
      let newEnd = pivot + (1 - mouseRatio) * newDur;
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > totalNs) {
        newStart -= newEnd - totalNs;
        newEnd = totalNs;
        if (newStart < 0) newStart = 0;
      }
      if (newEnd - newStart >= totalNs * 0.99) {
        setViewStart(0);
        setViewEnd(null);
      } else {
        setViewStart(newStart);
        setViewEnd(newEnd);
      }
    },
    [vStart, vEnd, totalNs],
  );

  useLayoutEffect(() => {
    const svg = zoomSvgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      dragRef.current = { startX: e.clientX, vs: vStart, ve: vEnd };
    },
    [vStart, vEnd],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Dragging takes precedence over cursor tracking — panning the view.
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const nsPerPx = visibleDur / PLOT_WIDTH;
        const delta = -dx * nsPerPx;
        let ns = dragRef.current.vs + delta;
        let ne = dragRef.current.ve + delta;
        const dur = ne - ns;
        if (ns < 0) {
          ns = 0;
          ne = dur;
        }
        if (ne > totalNs) {
          ne = totalNs;
          ns = totalNs - dur;
          if (ns < 0) ns = 0;
        }
        setViewStart(ns);
        setViewEnd(ne);
        setTooltip(null);
        setCursor(null);
        return;
      }
      // Track the cursor position in svg-local px and the matching ns offset
      // so the crosshair + stats popover can render. Clamped to the chart
      // plot area (don't show a cursor on the axis labels gutter).
      const rect = e.currentTarget.getBoundingClientRect();
      const xPx = Math.max(0, Math.min(PLOT_WIDTH, e.clientX - rect.left));
      const nsPerPx = visibleDur / PLOT_WIDTH;
      const tNs = vStart + xPx * nsPerPx;
      setCursor({ xPx, tNs, clientX: e.clientX, clientY: e.clientY });
    },
    [visibleDur, totalNs, vStart],
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current = null;
    setCursor(null);
  }, []);

  const resetZoom = useCallback(() => {
    setViewStart(0);
    setViewEnd(null);
  }, []);

  // Stable bar callbacks so TimelineBars' memo isn't defeated by fresh
  // closures on every tooltip/cursor state change.
  const handleBarHover = useCallback(
    (e: React.MouseEvent, row: RequestTimelineRow, req: RequestRecord) => {
      setTooltip({ x: e.clientX, y: e.clientY, row, req });
    },
    [],
  );
  const handleBarLeave = useCallback(() => setTooltip(null), []);
  const handleBarClick = useCallback(
    (e: React.MouseEvent, req: RequestRecord) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      openConversation(req);
    },
    [openConversation],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        No requests in the current filter.
      </div>
    );
  }

  const totalRequests = filtered.length;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          value={rowMode}
          options={ROW_MODE_OPTIONS}
          onValueChange={setRowMode}
          ariaLabel="Row mode"
          testId="timeline-row-mode"
          buttonClassName="px-2.5 py-1 text-xs"
        />
        {hasWarmup && (
          <SegmentedToggle
            value={phaseFilter}
            options={PHASE_OPTIONS}
            onValueChange={setPhaseFilter}
            ariaLabel="Phase filter"
            testId="timeline-phase-filter"
            buttonClassName="px-2.5 py-1 text-xs"
          />
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {totalRequests} request{totalRequests === 1 ? '' : 's'} · {rows.length}{' '}
          {rowMode === 'conversation' ? 'conversations' : 'workers'} · span{' '}
          {formatDuration((dataEnd - dataStart) / 1e6)} ·{' '}
          <span
            data-testid="timeline-total-idle-time"
            title="Time between the first request start and final request end with no requests in flight"
          >
            idle {formatDuration(idleStats.idleNs / 1e6)}
            {idleStats.spanNs > 0
              ? ` (${((idleStats.idleNs / idleStats.spanNs) * 100).toFixed(1)}%)`
              : ''}
          </span>
          {isZoomed && (
            <>
              {' · '}
              <button type="button" onClick={resetZoom} className="text-foreground hover:underline">
                reset zoom
              </button>
            </>
          )}
        </span>
      </div>

      {/* Chart container */}
      <div className="rounded-md border border-border/60 bg-card overflow-hidden">
        {/* Fixed-height window: rows scroll vertically and the chart scrolls
            horizontally inside it, so the card doesn't grow to fit every
            conversation/worker AND the horizontal scrollbar stays pinned to the
            window's bottom edge (rather than the bottom of the tall content). */}
        <div
          ref={scrollRef}
          className="overflow-auto"
          style={{ maxHeight: TIMELINE_BODY_MAX_HEIGHT }}
        >
          <div className="flex w-max">
            {/* Label column — pinned left (sticky) so it stays put during
                horizontal scroll, while scrolling vertically with the rows. */}
            <div
              className="sticky left-0 z-10 flex-shrink-0 border-r border-border/60 bg-card"
              style={{ width: LABEL_WIDTH }}
            >
              <div
                className="border-b border-border/60 flex items-end px-2 pb-1"
                style={{ height: HEADER_HEIGHT }}
              >
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  {rowMode === 'conversation' ? 'Conversation' : 'Worker'}
                </span>
              </div>
              {rows.map((row) => {
                const isSubagentRow = row.kind === 'subagent';
                const isChildRow = row.kind === 'stream' || row.kind === 'aux';
                const isExpandable = isSubagentRow && (row.streamCount ?? 1) > 1;
                const isExpanded = isExpandable && expandedSubagents.has(row.key);
                return (
                  <div
                    key={row.key}
                    data-timeline-row-kind={row.kind}
                    className="flex items-center gap-1 overflow-hidden pr-2"
                    style={{
                      height: ROW_HEIGHT + ROW_GAP,
                      paddingLeft: 4 + row.depth * 10,
                    }}
                  >
                    {isExpandable ? (
                      <button
                        type="button"
                        onClick={() => toggleSubagent(row.key)}
                        className="size-3.5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={isExpanded ? 'Collapse streams' : 'Expand streams'}
                        title={isExpanded ? 'Collapse streams' : 'Expand streams'}
                      >
                        <span className="text-[10px] leading-none">{isExpanded ? '▾' : '▸'}</span>
                      </button>
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <span
                      className="inline-block w-1 h-3 rounded-sm flex-shrink-0"
                      style={{
                        backgroundColor: row.color,
                        opacity: isChildRow ? 0.4 : isSubagentRow ? 0.55 : 1,
                      }}
                    />
                    <span
                      className="text-[10px] font-mono truncate"
                      style={{
                        color: row.color,
                        opacity: isChildRow ? 0.7 : isSubagentRow ? 0.85 : 1,
                      }}
                    >
                      {row.label}
                      {isExpandable && (
                        <span className="text-muted-foreground ml-1">×{row.streamCount}</span>
                      )}
                      {isSubagentRow && (row.auxCount ?? 0) > 0 && (
                        <span className="text-muted-foreground ml-1">+{row.auxCount} aux</span>
                      )}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground ml-auto shrink-0">
                      {row.requests.length > 0 ? row.requests.length : '—'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Chart column — horizontal scrolling is handled by the window
                container above so its scrollbar stays pinned to the window's
                bottom edge; double-click anywhere resets the zoom. */}
            <div className="flex-shrink-0">
              <svg
                ref={zoomSvgRef}
                width={CHART_WIDTH}
                height={svgHeight}
                className="block"
                style={{ cursor: isZoomed ? 'grab' : 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onDoubleClick={resetZoom}
              >
                <TimelineBars
                  rows={rows}
                  expandedSubagents={expandedSubagents}
                  dataStart={dataStart}
                  vStart={vStart}
                  vEnd={vEnd}
                  datasetSlug={datasetSlug}
                  onBarHover={handleBarHover}
                  onBarLeave={handleBarLeave}
                  onBarClick={handleBarClick}
                />

                {/* Cursor crosshair — drawn on top of bars so it stays visible
                  through dense rows. Stats popover is rendered as fixed
                  HTML below the SVG block. */}
                {cursor && (
                  <line
                    x1={cursor.xPx}
                    x2={cursor.xPx}
                    y1={0}
                    y2={svgHeight}
                    stroke="currentColor"
                    strokeWidth={1}
                    opacity={0.45}
                    pointerEvents="none"
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Footer — interaction hint only. */}
      <div className="flex items-center px-1 text-[11px] text-muted-foreground">
        <span className="ml-auto opacity-70">
          shift+scroll to zoom · drag to pan · double-click to reset
        </span>
      </div>

      {/* Cursor stats popover: count of in-flight / waiting at the cursor's
          ns offset. Hidden when the user is hovering an individual bar
          (per-request tooltip wins). */}
      {cursor && !tooltip && (
        <CursorPopover cursor={cursor} dataStart={dataStart} times={sortedTimes} />
      )}

      {/* Tooltip */}
      {tooltip && <TimelineTooltip data={tooltip} linkable={Boolean(datasetSlug)} />}
    </div>
  );
}
