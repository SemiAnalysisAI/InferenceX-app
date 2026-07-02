/**
 * Pure logic for the trace flamegraph: overlap detection, deep-link resolution,
 * visible-row construction, and bracket-lane layout. No React/DOM — everything
 * here is unit-testable directly. Rendering lives in trace-flamegraph.tsx.
 */

import type { StructureNode } from '@/hooks/api/use-datasets';

// Kept distinct from token-segment colors. A row can carry multiple rails when
// it overlaps different requests during different parts of its lifetime.
export const OVERLAP_COLORS = ['#06b6d4', '#ec4899', '#6366f1', '#84cc16', '#f97316'] as const;

// Cap on simultaneously-drawn bracket lanes. A pathological conversation (e.g. a
// long-running session whose subagent fans out into hundreds of children with
// 15+ concurrent requests) can require dozens of lanes; left unbounded the
// gutter grows wide enough to push the bars off-screen AND emits one DOM node
// per lane per row (tens of thousands of empty divs). We bound it: lanes beyond
// the cap fold into the last "dense" lane, which stays readable for the common
// case (≤6 concurrent) and degrades gracefully for the outliers.
export const MAX_LANES = 6;

export interface TimedRequest {
  key: string;
  startS?: number;
  endS?: number;
}

export interface RequestOverlapGroup {
  id: string;
  requestKeys: string[];
  startS: number;
  endS: number;
}

/**
 * Find maximal sets of requests that were simultaneously in flight.
 * Intervals are half-open, so one request ending exactly when another begins
 * is serialized rather than parallel. Maximal-set filtering prevents a nested
 * A/B pair from duplicating an A/B/C marker, while preserving A/B and B/C as
 * separate groups when their overlaps happen at different times.
 */
export function findRequestOverlapGroups(
  requests: TimedRequest[],
  scopeKey = 'scope',
): RequestOverlapGroup[] {
  const valid = requests.filter(
    (request): request is TimedRequest & { startS: number; endS: number } =>
      Number.isFinite(request.startS) &&
      Number.isFinite(request.endS) &&
      request.endS! > request.startS!,
  );
  const boundaries = [
    ...new Set(valid.flatMap((request) => [request.startS, request.endS])),
  ].toSorted((a, b) => a - b);
  const candidates = new Map<string, Omit<RequestOverlapGroup, 'id'>>();

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startS = boundaries[i]!;
    const endS = boundaries[i + 1]!;
    if (endS <= startS) continue;
    const requestKeys = valid
      .filter((request) => request.startS <= startS && request.endS >= endS)
      .map((request) => request.key)
      .toSorted();
    if (requestKeys.length < 2) continue;
    const key = requestKeys.join('\u0000');
    const existing = candidates.get(key);
    candidates.set(key, {
      requestKeys,
      startS: existing ? Math.min(existing.startS, startS) : startS,
      endS: existing ? Math.max(existing.endS, endS) : endS,
    });
  }

  const maximal = [...candidates.values()].filter(
    (candidate, _, all) =>
      !all.some(
        (other) =>
          other.requestKeys.length > candidate.requestKeys.length &&
          candidate.requestKeys.every((key) => other.requestKeys.includes(key)),
      ),
  );

  return maximal
    .toSorted(
      (a, b) =>
        a.startS - b.startS ||
        a.endS - b.endS ||
        a.requestKeys.join(',').localeCompare(b.requestKeys.join(',')),
    )
    .map((group, index) => ({ ...group, id: `${scopeKey}-${index + 1}` }));
}

export interface RowOverlap {
  id: string;
  label: string;
  color: string;
  startS: number;
  endS: number;
  peerCount: number;
}

export interface VisibleRow {
  key: string;
  label: string;
  sublabel?: string;
  timeLabel?: string;
  cached: number;
  uncached: number;
  output: number;
  total: number;
  indent: number;
  isGroup: boolean;
  isExpanded: boolean;
  groupIndex?: number;
  overlaps: RowOverlap[];
}

/** Format seconds from conversation start as a compact elapsed timestamp. */
export function formatElapsedTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Elapsed-interval label for a row ("+MM:SS–MM:SS"), or undefined when untimed. */
export function timeLabel(startS?: number, endS?: number): string | undefined {
  if (startS === undefined || !Number.isFinite(startS)) return undefined;
  const start = formatElapsedTime(startS);
  if (endS === undefined || !Number.isFinite(endS) || endS <= startS) return `+${start}`;
  return `+${start}–${formatElapsedTime(endS)}`;
}

export interface DeepLinkHighlight {
  turn?: number | null;
  raw?: number | null;
  inner?: number | null;
  agent?: string | null;
}

export interface DeepLinkTarget {
  rowKey: string;
  expandGroup: number | null;
}

/**
 * Resolve a request-timeline deep link to a flamegraph row key (+ the subagent
 * group that must be expanded to show it). Raw Weka source coordinates are
 * exact and take precedence:
 *   raw=<outer>             -> top-level Weka request
 *   raw=<outer>&inner=<idx> -> subagent child inside that top-level marker
 * Otherwise main turns match by main-turn ordinal and subagent turns match the
 * group by agentId, then the ti-th child.
 *
 * `buildConversationStructure` emits exactly one node per raw Weka entry (and
 * one child per nested entry), so a node's array position IS its raw index.
 * Structures ingested before rawIndex/innerIndex were stored omit the explicit
 * fields — fall back to the array position so deep links keep resolving against
 * those older rows instead of silently doing nothing.
 */
export function resolveDeepLinkTarget(
  nodes: readonly StructureNode[],
  highlight: DeepLinkHighlight,
): DeepLinkTarget | null {
  const { turn, raw, inner, agent } = highlight;
  if (typeof raw === 'number' && raw >= 0) {
    if (typeof inner === 'number' && inner >= 0) {
      const gi = nodes.findIndex(
        (node, i) => node.kind === 'subagent' && (node.rawIndex ?? i) === raw,
      );
      if (gi === -1) return null;
      const group = nodes[gi] as Extract<StructureNode, { kind: 'subagent' }>;
      const ci = group.children.findIndex((child, i) => (child.innerIndex ?? i) === inner);
      if (ci === -1) return null;
      return { rowKey: `g-${gi}-c-${ci}`, expandGroup: gi };
    }
    const i = nodes.findIndex(
      (node, idx) => node.kind === 'turn' && (node.rawIndex ?? idx) === raw,
    );
    if (i !== -1) return { rowKey: `t-${i}`, expandGroup: null };
    return null;
  }
  if (typeof turn !== 'number' || turn < 0) return null;
  if (agent) {
    const gi = nodes.findIndex((n) => n.kind === 'subagent' && n.agentId === agent);
    if (gi === -1) return null;
    const group = nodes[gi] as Extract<StructureNode, { kind: 'subagent' }>;
    if (turn >= group.children.length) return null;
    return { rowKey: `g-${gi}-c-${turn}`, expandGroup: gi };
  }
  let ordinal = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].kind === 'turn') {
      if (ordinal === turn) return { rowKey: `t-${i}`, expandGroup: null };
      ordinal += 1;
    }
  }
  return null;
}

/**
 * Overlap groups per row key. Main-agent turns and each subagent's children are
 * separate scopes — parallelism is only meaningful within one agent's stream.
 */
export function buildRowOverlaps(nodes: readonly StructureNode[]): Map<string, RowOverlap[]> {
  const mainGroups = findRequestOverlapGroups(
    nodes.flatMap((node, i) =>
      node.kind === 'turn' ? [{ key: `t-${i}`, startS: node.startS, endS: node.endS }] : [],
    ),
    'main',
  );
  const subagentGroups = nodes.flatMap((node, i) =>
    node.kind === 'subagent'
      ? findRequestOverlapGroups(
          node.children.map((child, ci) => ({
            key: `g-${i}-c-${ci}`,
            startS: child.startS,
            endS: child.endS,
          })),
          `subagent-${i}`,
        )
      : [],
  );
  const groups: RequestOverlapGroup[] = [...mainGroups, ...subagentGroups];

  const byRow = new Map<string, RowOverlap[]>();
  groups.forEach((group, groupIndex) => {
    const overlap = {
      id: group.id,
      label: `P${groupIndex + 1}`,
      color: OVERLAP_COLORS[groupIndex % OVERLAP_COLORS.length]!,
      startS: group.startS,
      endS: group.endS,
      peerCount: group.requestKeys.length - 1,
    };
    group.requestKeys.forEach((key) => byRow.set(key, [...(byRow.get(key) ?? []), overlap]));
  });
  return byRow;
}

/**
 * Flatten structure nodes into the rows currently visible: one row per main
 * turn, one header per subagent group, plus indented children for expanded
 * groups. Row keys (`t-<i>`, `g-<i>`, `g-<i>-c-<ci>`) index by node position so
 * they stay stable across expand/collapse.
 */
export function buildVisibleRows(
  nodes: readonly StructureNode[],
  expanded: ReadonlySet<number>,
  overlapsByRow: ReadonlyMap<string, RowOverlap[]>,
): VisibleRow[] {
  const out: VisibleRow[] = [];
  let turnNo = 0;
  nodes.forEach((node: StructureNode, i) => {
    if (node.kind === 'turn') {
      turnNo += 1;
      out.push({
        key: `t-${i}`,
        label: `Turn ${turnNo}`,
        sublabel: node.model ?? undefined,
        timeLabel: timeLabel(node.startS, node.endS),
        cached: node.cached,
        uncached: node.uncached,
        output: node.out,
        total: node.in + node.out,
        indent: 0,
        isGroup: false,
        isExpanded: false,
        overlaps: overlapsByRow.get(`t-${i}`) ?? [],
      });
    } else {
      const isExpanded = expanded.has(i);
      out.push({
        key: `g-${i}`,
        label: `${node.label}`,
        sublabel: `${node.children.length} turn${node.children.length === 1 ? '' : 's'}${
          node.durationMs ? ` · ${(node.durationMs / 1000).toFixed(0)}s` : ''
        }`,
        timeLabel: timeLabel(node.startS, node.endS),
        cached: node.cached,
        uncached: node.uncached,
        output: node.out,
        total: node.in + node.out,
        indent: 0,
        isGroup: true,
        isExpanded,
        groupIndex: i,
        overlaps: [],
      });
      if (isExpanded) {
        node.children.forEach((child, ci) => {
          out.push({
            key: `g-${i}-c-${ci}`,
            label: `↳ subturn ${ci + 1}`,
            sublabel: child.model ?? undefined,
            timeLabel: timeLabel(child.startS, child.endS),
            cached: child.cached,
            uncached: child.uncached,
            output: child.out,
            total: child.in + child.out,
            indent: 1,
            isGroup: false,
            isExpanded: false,
            overlaps: overlapsByRow.get(`g-${i}-c-${ci}`) ?? [],
          });
        });
      }
    }
  });
  return out;
}

export interface BraceSeg {
  role: 'first' | 'middle' | 'last' | 'through';
  isMember: boolean;
  color: string;
  groupId: string;
  peerCount: number;
  startS: number;
  endS: number;
}

export interface BraceLayout {
  laneCount: number;
  overflowLanes: number;
  /** Per visible row: only the lanes that actually carry a bracket segment. */
  rowSegs: { lane: number; seg: BraceSeg }[][];
}

/**
 * Geometry for the parallel-group brackets drawn in the left gutter. Each
 * overlap group becomes a vertical bracket spanning from its first to its last
 * visible member row, with a right-pointing tick on the exact member rows.
 * Non-transitive chains (a row in two groups) get separate lanes so their
 * brackets sit side by side. `through` = a row inside a group's span that is
 * NOT itself a member (the aux-stream edge case) — drawn as a faint connector
 * with no tick.
 */
export function computeBraceLayout(rows: readonly VisibleRow[]): BraceLayout {
  const groupMap = new Map<
    string,
    { id: string; color: string; peerCount: number; startS: number; endS: number; idxs: number[] }
  >();
  rows.forEach((r, idx) => {
    for (const ov of r.overlaps) {
      const g = groupMap.get(ov.id) ?? {
        id: ov.id,
        color: ov.color,
        peerCount: ov.peerCount,
        startS: ov.startS,
        endS: ov.endS,
        idxs: [],
      };
      g.idxs.push(idx);
      groupMap.set(ov.id, g);
    }
  });
  const groups = [...groupMap.values()]
    .filter((g) => g.idxs.length >= 2) // need ≥2 visible members to bracket
    .map((g) => ({
      ...g,
      min: Math.min(...g.idxs),
      max: Math.max(...g.idxs),
      members: new Set(g.idxs),
    }))
    .toSorted((a, b) => a.min - b.min || a.max - b.max);

  // Greedy lane assignment: a group reuses a lane whose previous group ended
  // before this one starts.
  const laneEnd: number[] = [];
  const laneOf = new Map<string, number>();
  for (const g of groups) {
    let lane = laneEnd.findIndex((end) => end < g.min);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(g.max);
    } else {
      laneEnd[lane] = g.max;
    }
    laneOf.set(g.id, lane);
  }
  const rawLaneCount = laneEnd.length;
  // Bound the gutter (see MAX_LANES). Lanes past the cap collapse onto the last
  // visible lane, so every parallel row still carries a marker but the gutter
  // width and DOM-node count stay bounded regardless of how parallel the
  // conversation is.
  const laneCount = Math.min(rawLaneCount, MAX_LANES);
  const displayLane = (lane: number) => Math.min(lane, laneCount - 1);

  // Sparse per-row segments: only lanes that actually carry a bracket on a row
  // are stored (and later rendered). The previous dense matrix emitted one DOM
  // node per lane per row — catastrophic at 49 lanes × 2k rows.
  const rowSegs: { lane: number; seg: BraceSeg }[][] = rows.map(() => []);
  for (const g of groups) {
    const lane = displayLane(laneOf.get(g.id)!);
    for (let idx = g.min; idx <= g.max; idx++) {
      const isMember = g.members.has(idx);
      const role =
        idx === g.min ? 'first' : idx === g.max ? 'last' : isMember ? 'middle' : 'through';
      const seg: BraceSeg = {
        role,
        isMember,
        color: g.color,
        groupId: g.id,
        peerCount: g.peerCount,
        startS: g.startS,
        endS: g.endS,
      };
      const cell = rowSegs[idx]!;
      const existing = cell.find((c) => c.lane === lane);
      // Collisions only happen in the folded overflow lane. Prefer a real
      // member marker over a faint pass-through connector.
      if (!existing) cell.push({ lane, seg });
      else if (seg.isMember && !existing.seg.isMember) existing.seg = seg;
    }
  }
  return { laneCount, overflowLanes: rawLaneCount - laneCount, rowSegs };
}
