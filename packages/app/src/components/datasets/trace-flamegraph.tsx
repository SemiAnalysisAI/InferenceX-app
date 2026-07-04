'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ConversationStructure } from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics';
import { compact, formatShare } from './format';
import {
  buildRowOverlaps,
  buildVisibleRows,
  computeBraceLayout,
  formatElapsedTime,
  MAX_LANES,
  OVERLAP_COLORS,
  resolveDeepLinkTarget,
  type VisibleRow,
} from './trace-flamegraph-model';

// Pure logic lives in trace-flamegraph-model.ts; re-exported here so this file
// stays the module entry point for the flamegraph's public API.
export {
  findRequestOverlapGroups,
  formatElapsedTime,
  resolveDeepLinkTarget,
} from './trace-flamegraph-model';
export type {
  DeepLinkHighlight,
  DeepLinkTarget,
  RequestOverlapGroup,
  TimedRequest,
} from './trace-flamegraph-model';

// Stacked-bar segment colors. Cached prefix vs uncached input vs output —
// fixed hues (theme-independent) so the meaning is stable in light/dark.
const SEG = {
  cached: '#10b981', // emerald-500 — input served from prefix cache
  uncached: '#f59e0b', // amber-500 — input that must be (re)computed
  output: '#8b5cf6', // violet-500 — generated tokens
} as const;

const LEGEND = [
  { key: 'cached', label: 'Cached prefix', color: SEG.cached },
  { key: 'uncached', label: 'Uncached input', color: SEG.uncached },
  { key: 'output', label: 'Output', color: SEG.output },
] as const;

// Width (px) of one parallel-group bracket lane in the left gutter. Overlapping
// groups (non-transitive chains) get their own lane so their brackets sit
// side-by-side instead of stacking visually.
const LANE_W = 14;

interface TooltipState {
  x: number;
  y: number;
  row: VisibleRow;
}

/**
 * Per-conversation flamegraph driven by the precomputed `structure` JSONB.
 * One row per turn; subagent groups render a collapsible header with indented
 * children (collapsed by default). Each bar stacks cached-prefix + uncached
 * input + output, scaled to the widest visible turn.
 */
export function TraceFlamegraph({
  structure,
  highlightTurn,
  highlightRawIndex,
  highlightInnerIndex,
  highlightAgentId,
}: {
  structure: ConversationStructure;
  /** Turn index to scroll to / highlight (from a request-timeline deep link). */
  highlightTurn?: number | null;
  /** Raw Weka top-level request index to scroll to / highlight. */
  highlightRawIndex?: number | null;
  /** Raw Weka nested request index under highlightRawIndex, for subagent children. */
  highlightInnerIndex?: number | null;
  /** Subagent id when the highlighted turn is inside a subagent group. */
  highlightAgentId?: string | null;
}) {
  const nodes = structure.nodes;

  // Resolve the deep-link target to a row key (+ the group that must be open to
  // show it). See resolveDeepLinkTarget for the matching rules.
  const target = useMemo(
    () =>
      resolveDeepLinkTarget(nodes, {
        turn: highlightTurn,
        raw: highlightRawIndex,
        inner: highlightInnerIndex,
        agent: highlightAgentId,
      }),
    [nodes, highlightTurn, highlightRawIndex, highlightInnerIndex, highlightAgentId],
  );

  // Subagent groups collapsed by default — except the deep-link target's group.
  const [expanded, setExpanded] = useState<Set<number>>(() =>
    typeof target?.expandGroup === 'number' ? new Set([target.expandGroup]) : new Set(),
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Portal target only exists after mount (the tooltip is portaled to body so
  // its position:fixed is viewport-relative, immune to ancestor transforms).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The deep-link target row gets a state-driven highlight (ring + bg flash)
  // that fades out — state-driven so a re-render can't clobber it, and so the
  // fade is a real CSS transition rather than an abrupt classList removal.
  const [highlightKey, setHighlightKey] = useState<string | null>(target?.rowKey ?? null);

  // When the deep-link target resolves/changes: expand its subagent group, then
  // (after the row renders) scroll it into view and flash the highlight. Runs on
  // first load and on any later target change (e.g. clicking another bar into
  // the same conversation). The row query/scroll is deferred to the next frame
  // so the just-expanded child row exists in the DOM.
  useEffect(() => {
    if (!target) return;
    if (typeof target.expandGroup === 'number') {
      const gi = target.expandGroup;
      setExpanded((prev) => (prev.has(gi) ? prev : new Set(prev).add(gi)));
    }
    setHighlightKey(target.rowKey);
    const raf = requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-rowkey="${target.rowKey}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    const t = setTimeout(() => setHighlightKey(null), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [target]);

  const groupIndexes = useMemo(() => {
    const out: number[] = [];
    nodes.forEach((node, i) => {
      if (node.kind === 'subagent') out.push(i);
    });
    return out;
  }, [nodes]);

  const toggle = useCallback((i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setExpanded(new Set(groupIndexes)), [groupIndexes]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const overlapsByRow = useMemo(() => buildRowOverlaps(nodes), [nodes]);

  const rows = useMemo(
    () => buildVisibleRows(nodes, expanded, overlapsByRow),
    [nodes, expanded, overlapsByRow],
  );

  // Two scales: leaf turns/subturns share a per-turn axis (the primary signal —
  // how cached/uncached evolves), while subagent group headers carry aggregates
  // orders of magnitude larger, so they get their own axis to stay comparable to
  // each other. Group bars render slim + muted, so the mixed scale reads as a
  // distinct "group summary" track rather than a contradiction.
  const maxTotal = useMemo(
    () => Math.max(1, ...rows.filter((r) => !r.isGroup).map((r) => r.total)),
    [rows],
  );
  const maxGroupTotal = useMemo(
    () => Math.max(1, ...rows.filter((r) => r.isGroup).map((r) => r.total)),
    [rows],
  );

  const braces = useMemo(() => computeBraceLayout(rows), [rows]);

  const onMove = (e: React.MouseEvent, row: VisibleRow) => {
    setTooltip({ x: e.clientX, y: e.clientY, row });
  };

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          {LEGEND.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-sm"
                style={{ backgroundColor: l.color }}
              />
              <span className="text-muted-foreground">{l.label}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-4 w-2 rounded-l-sm border-y-2 border-l-2"
              style={{ borderColor: OVERLAP_COLORS[0] }}
            />
            <span className="text-muted-foreground">Bracketed rows ran in parallel</span>
          </span>
        </div>
        {groupIndexes.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                track('datasets_flamegraph_expand_all');
                expandAll();
              }}
              className="rounded-md border border-border/40 px-2 py-1 text-xs hover:bg-accent"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => {
                track('datasets_flamegraph_collapse_all');
                collapseAll();
              }}
              className="rounded-md border border-border/40 px-2 py-1 text-xs hover:bg-accent"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {braces.overflowLanes > 0 && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Dense parallel region — bracket lanes capped at {MAX_LANES}; {braces.overflowLanes}{' '}
          further overlapping {braces.overflowLanes === 1 ? 'group is' : 'groups are'} folded into
          the last lane.
        </p>
      )}

      <div
        ref={scrollRef}
        className="max-h-[520px] overflow-y-auto overflow-x-hidden rounded-md border border-border/40 bg-muted/10 p-2"
      >
        {/* gap-0 so the per-row bracket segments connect into a continuous
            vertical rail across the rows of a parallel group. */}
        <div className="flex flex-col gap-0">
          {rows.map((row, idx) => {
            // Group headers use the group axis; turns/subturns use the per-turn
            // axis. Clamp to the track width either way.
            const denom = row.isGroup ? maxGroupTotal : maxTotal;
            const widthPct = Math.min(100, Math.max(0.5, (row.total / denom) * 100));
            const cw = row.total > 0 ? (row.cached / row.total) * 100 : 0;
            const uw = row.total > 0 ? (row.uncached / row.total) * 100 : 0;
            const ow = row.total > 0 ? (row.output / row.total) * 100 : 0;
            const isHighlighted = row.key === highlightKey;
            const segs = braces.rowSegs[idx]!;
            return (
              <div
                key={row.key}
                data-rowkey={row.key}
                className={`flex items-stretch rounded-sm transition-colors duration-700 ${
                  isHighlighted ? 'bg-primary/20 ring-2 ring-primary' : 'ring-0'
                }`}
              >
                {/* Parallel-group bracket gutter (only rendered when the
                    conversation has any overlaps, so non-overlap traces keep a
                    flush-left layout with no dead space). Segments are sparse and
                    absolutely positioned per lane so a row only pays for the
                    lanes it actually touches. */}
                {braces.laneCount > 0 && (
                  <div
                    className="relative shrink-0 self-stretch"
                    style={{ width: braces.laneCount * LANE_W }}
                  >
                    {segs.map(({ lane, seg }) => {
                      const top = seg.role === 'first' ? '50%' : '0';
                      const bottom = seg.role === 'last' ? '50%' : '0';
                      return (
                        <div
                          key={`${lane}-${seg.groupId}`}
                          className="absolute top-0 bottom-0"
                          style={{ left: lane * LANE_W, width: LANE_W }}
                          {...(seg.isMember
                            ? {
                                'data-testid': `flamegraph-overlap-${row.key}`,
                                'data-overlap-group': seg.groupId,
                              }
                            : {})}
                          title={
                            seg.isMember
                              ? `Ran in parallel with ${seg.peerCount} other request${
                                  seg.peerCount === 1 ? '' : 's'
                                } (+${formatElapsedTime(seg.startS)}–${formatElapsedTime(seg.endS)})`
                              : undefined
                          }
                        >
                          {/* vertical rail */}
                          <div
                            className="absolute"
                            style={{
                              left: 5,
                              width: 2,
                              top,
                              bottom,
                              backgroundColor: seg.color,
                              opacity: seg.isMember ? 0.95 : 0.3,
                              borderTopLeftRadius: seg.role === 'first' ? 3 : 0,
                              borderBottomLeftRadius: seg.role === 'last' ? 3 : 0,
                            }}
                          />
                          {/* right-pointing tick marking an actual member row */}
                          {seg.isMember && (
                            <div
                              className="absolute"
                              style={{
                                left: 5,
                                top: '50%',
                                height: 2,
                                width: LANE_W - 7,
                                transform: 'translateY(-1px)',
                                backgroundColor: seg.color,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* row content (indented for subagent children) */}
                <div
                  className="flex flex-1 items-center gap-2 py-0.5"
                  style={{ paddingLeft: row.indent * 20 }}
                >
                  {/* label / group toggle */}
                  <div className="flex w-52 shrink-0 items-center overflow-hidden">
                    {row.isGroup ? (
                      <button
                        type="button"
                        onClick={() => {
                          track('datasets_flamegraph_group_toggled', {
                            expanded: !row.isExpanded,
                          });
                          if (row.groupIndex !== undefined) toggle(row.groupIndex);
                        }}
                        className="flex items-center gap-1 truncate text-left text-xs font-medium text-foreground hover:text-primary"
                      >
                        <span className="inline-block w-3 text-muted-foreground">
                          {row.isExpanded ? '▾' : '▸'}
                        </span>
                        <span className="truncate">{row.label}</span>
                      </button>
                    ) : (
                      <span className="truncate pl-4 text-xs text-foreground">{row.label}</span>
                    )}
                  </div>

                  {/* Original interval, measured from conversation start. */}
                  <div
                    className="w-36 shrink-0 text-[11px] tabular-nums text-muted-foreground"
                    data-testid={`flamegraph-time-${row.key}`}
                  >
                    {row.timeLabel ?? '—'}
                  </div>

                  {/* stacked bar — group headers render as a slim muted summary
                      strip so they read as aggregates, not individual turns. */}
                  <div
                    className="relative flex h-5 flex-1 items-center"
                    onMouseMove={(e) => onMove(e, row)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div
                      className={`flex overflow-hidden rounded-sm ${
                        row.isGroup ? 'h-2.5 opacity-80' : 'h-5'
                      }`}
                      style={{ width: `${widthPct}%` }}
                    >
                      <div style={{ width: `${cw}%`, backgroundColor: SEG.cached }} />
                      <div style={{ width: `${uw}%`, backgroundColor: SEG.uncached }} />
                      <div style={{ width: `${ow}%`, backgroundColor: SEG.output }} />
                    </div>
                  </div>

                  {/* total */}
                  <div className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {compact(row.total)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tooltip &&
        mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            <div className="mb-1 font-medium text-foreground">
              {tooltip.row.label}
              {tooltip.row.sublabel ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  {tooltip.row.sublabel}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-muted-foreground">
              <span style={{ color: SEG.cached }}>Cached prefix</span>
              <span className="text-right tabular-nums text-foreground">
                {compact(tooltip.row.cached)}
              </span>
              <span style={{ color: SEG.uncached }}>Uncached input</span>
              <span className="text-right tabular-nums text-foreground">
                {compact(tooltip.row.uncached)}
              </span>
              <span style={{ color: SEG.output }}>Output</span>
              <span className="text-right tabular-nums text-foreground">
                {compact(tooltip.row.output)}
              </span>
              <span>Cached %</span>
              <span className="text-right tabular-nums text-foreground">
                {formatShare(tooltip.row.cached, tooltip.row.cached + tooltip.row.uncached)}
              </span>
              <span>From start</span>
              <span className="text-right tabular-nums text-foreground">
                {tooltip.row.timeLabel ?? '—'}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
