/**
 * Pure row-building logic for the request timeline: cid parsing, deep-link
 * hrefs, stable ordering/coloring, and grouping requests into Gantt rows.
 * No React — everything here is unit-testable data transformation.
 */

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

export type RowMode = 'conversation' | 'worker';

/**
 * The dataset conversation id for a request: the cid with any subagent/forked
 * suffix (`::sa:…`, `::fa:…`) stripped. This is exactly the `conv_id` stored in
 * dataset_conversations, so it deep-links into /datasets/<slug>/conversations/.
 */
export function datasetConvId(cid: string): string {
  const i = cid.indexOf('::');
  return i === -1 ? cid : cid.slice(0, i);
}

/**
 * The subagent id encoded in a cid (`…::sa:<agent_id>[:s<n>|:aux:<n>]`), or null
 * for a main-conversation request. The harness fans a single subagent into
 * parallel streams with a `:s<n>` or `:aux:<n>` suffix; the dataset
 * SubagentNode.agentId is the bare base (e.g. `subagent_001_b00fdc12`). Agent
 * ids never contain a colon, so the base is everything up to the first one.
 */
export function subagentIdOf(cid: string): string | null {
  const i = cid.indexOf('::sa:');
  if (i === -1) return null;
  const raw = cid.slice(i + '::sa:'.length);
  const colon = raw.indexOf(':');
  return colon === -1 ? raw : raw.slice(0, colon);
}

/**
 * Deep-link URL for the dataset conversation a request maps to. Carries the turn
 * (and, for subagent requests, the subagent id) so the flamegraph can scroll to
 * / highlight the exact node. Used both for SPA navigation on click and as the
 * real `href` on the request bar so the browser's native "open in new tab"
 * (right-click, ⌘/Ctrl-click, middle-click) works.
 */
export function conversationHref(datasetSlug: string, req: RequestRecord): string {
  const convId = req.srcTrace ?? datasetConvId(req.cid);
  const params = new URLSearchParams({ turn: String(req.ti) });
  if (typeof req.srcOuter === 'number' && Number.isInteger(req.srcOuter) && req.srcOuter >= 0) {
    params.set('raw', String(req.srcOuter));
    if (typeof req.srcInner === 'number' && Number.isInteger(req.srcInner) && req.srcInner >= 0) {
      params.set('inner', String(req.srcInner));
    }
  }
  const sa = subagentIdOf(req.cid);
  if (sa && !params.has('inner')) params.set('sa', sa);
  return `/datasets/${datasetSlug}/conversations/${encodeURIComponent(convId)}?${params.toString()}`;
}

/** Human label for where a request came from (raw trace index or replay turn). */
export function requestSourceLabel(req: RequestRecord): string {
  if (typeof req.srcOuter === 'number') {
    if (typeof req.srcInner === 'number') return `raw ${req.srcOuter} / child ${req.srcInner}`;
    return `raw ${req.srcOuter}`;
  }
  return `replay turn ${req.ti + 1}`;
}

export interface RequestIdleStats {
  /** Total time between the first start and last end with no request running. */
  idleNs: number;
  /** Wall-clock span from the first request start to the final request end. */
  spanNs: number;
}

/**
 * Merge request intervals and sum the gaps between them. Queue time before a
 * request starts is intentionally excluded: "in flight" means [start, end].
 */
export function requestIdleStats(requests: readonly RequestRecord[]): RequestIdleStats {
  const intervals = requests
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .map(({ start, end }) => ({ start, end }))
    .toSorted((a, b) => a.start - b.start || a.end - b.end);
  if (intervals.length === 0) return { idleNs: 0, spanNs: 0 };

  const firstStart = intervals[0]!.start;
  let mergedEnd = intervals[0]!.end;
  let idleNs = 0;
  for (let i = 1; i < intervals.length; i++) {
    const interval = intervals[i]!;
    if (interval.start > mergedEnd) idleNs += interval.start - mergedEnd;
    if (interval.end > mergedEnd) mergedEnd = interval.end;
  }
  return { idleNs, spanNs: mergedEnd - firstStart };
}

/** A stable color palette indexed by row-key hash. */
const ROW_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#eab308',
];

/**
 * Row kinds:
 *   parent           — top-level conversation (depth 0)
 *   worker           — worker swimlane (depth 0, worker mode)
 *   subagent         — a subagent invocation (depth 1). Either a single
 *                      stream (renders its own bars), or a multi-stream
 *                      container whose bars are the union of its streams
 *                      when collapsed.
 *   stream           — one :sN stream of a multi-stream subagent (depth 2).
 *                      Hidden by default; toggled in via the parent's chevron.
 *   aux              — one :aux:N parallel lane (depth 2). Always visible
 *                      beneath its owning subagent.
 */
type RowKind = 'parent' | 'worker' | 'subagent' | 'stream' | 'aux';

export interface RequestTimelineRow {
  key: string;
  label: string;
  color: string;
  requests: RequestRecord[];
  depth: number;
  kind: RowKind;
  /** Number of streams under this subagent (>=1). Only set for subagent rows. */
  streamCount?: number;
  /** For stream rows: the parent subagent's row key (drives expand/collapse). */
  parentRowKey?: string;
  /** Number of always-visible auxiliary lanes under this subagent. */
  auxCount?: number;
}

/**
 * Conversation ids for subagent calls look like
 *   <parent_cid>::sa:<agent_id>[:s<stream_idx>|:aux:<aux_idx>]
 * The optional `:s<N>` suffix is set when the harness fans a single
 * subagent into multiple parallel "streams" (interval-graph
 * decomposition in weka_trace._pack_into_streams). We split it off so
 * we can group every parallel lane under a single subagent header row.
 *
 * Aux lanes can also hang directly off the main conversation (no `::sa:`
 * segment): `<parent_cid>::aux:<aux_idx>` or `<parent_cid>::aux:red:<aux_idx>`.
 * These are parallel requests belonging to the main agent itself, so they
 * nest under the parent conversation row rather than forming their own
 * top-level group.
 */
export function splitTimelineCid(cid: string): {
  parent: string;
  subagentBase: string | null;
  stream: number | null;
  aux: string | null;
} {
  const sep = cid.indexOf('::sa:');
  if (sep === -1) {
    const auxSep = cid.indexOf('::aux:');
    if (auxSep !== -1) {
      return {
        parent: cid.slice(0, auxSep),
        subagentBase: null,
        stream: null,
        aux: cid.slice(auxSep + '::aux:'.length),
      };
    }
    return { parent: cid, subagentBase: null, stream: null, aux: null };
  }
  const parent = cid.slice(0, sep);
  const raw = cid.slice(sep + 5);
  const auxMatch = /^(?<base>[^:]+):aux:(?<aux>.+)$/.exec(raw);
  if (auxMatch) {
    return {
      parent,
      subagentBase: auxMatch.groups!.base!,
      stream: null,
      aux: auxMatch.groups!.aux!,
    };
  }
  const m = /^(?<base>.*):s(?<stream>\d+)$/.exec(raw);
  if (m) return { parent, subagentBase: m[1]!, stream: Number(m[2]), aux: null };
  return { parent, subagentBase: raw, stream: null, aux: null };
}

/**
 * Stable order/color index for the top-level row groups (conversations in
 * conversation mode, workers in worker mode), keyed by group id and computed
 * over the FULL (unfiltered) request set. Both the row ordering and the color
 * palette are driven by this index, so a conversation/worker keeps the same
 * position and color when the phase filter changes the visible subset — without
 * it, filtering to warmup vs profiling re-sorts and re-colors by whatever subset
 * is showing, making rows jump and swap colors.
 *
 * Groups that span BOTH phases sort first. The shared set is by definition
 * present in either phase's view, so this leading block renders identically in
 * both — a conversation that carries over from warmup into profiling stays on
 * the exact same row when the toggle flips. Phase-exclusive groups follow, and
 * only they reflow between views. Within each block the order key is the
 * group's earliest request start across all phases; ties break on the group id
 * for determinism.
 */
export function computeStableRowIndex(
  requests: readonly RequestRecord[],
  mode: RowMode,
): Map<string, number> {
  const firstStart = new Map<string, number>();
  // Which phases each group appears in. Mirrors requestsForPhase's split:
  // 'profiling' is exact, anything else counts as warmup.
  const inProfiling = new Set<string>();
  const inWarmup = new Set<string>();
  for (const r of requests) {
    const key = mode === 'conversation' ? splitTimelineCid(r.cid).parent : r.wid;
    const cur = firstStart.get(key);
    if (cur === undefined || r.start < cur) firstStart.set(key, r.start);
    if (r.phase === 'profiling') inProfiling.add(key);
    else inWarmup.add(key);
  }
  const spansBoth = (key: string) => inProfiling.has(key) && inWarmup.has(key);
  const keys = [...firstStart.keys()].toSorted(
    (a, b) =>
      Number(spansBoth(b)) - Number(spansBoth(a)) ||
      firstStart.get(a)! - firstStart.get(b)! ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
  const index = new Map<string, number>();
  keys.forEach((key, i) => index.set(key, i));
  return index;
}

/**
 * Group requests into rows. In conversation mode, output order is:
 *   parent_conv
 *     subagent_001                  (collapsed by default, container)
 *       :s0                         (hidden unless expanded)
 *       :s1
 *       aux 011 · parallel          (always visible)
 *     subagent_002
 *     ...
 *
 * `expandedSubagents` controls which subagent containers reveal their
 * stream children. Bars on a collapsed subagent are the UNION of all its
 * streams' requests — overlapping bars visually communicate the
 * stream-level parallelism without expanding.
 *
 * `stableRowIndex` (optional) pins the top-level order + color per group so they
 * survive phase-filter changes; when omitted it's derived from `requests` (the
 * legacy self-contained behavior, used by unit tests).
 */
export function buildRequestTimelineRows(
  requests: RequestRecord[],
  mode: RowMode,
  expandedSubagents: ReadonlySet<string>,
  stableRowIndex?: ReadonlyMap<string, number>,
): RequestTimelineRow[] {
  const index = stableRowIndex ?? computeStableRowIndex(requests, mode);
  const colorFor = (key: string) =>
    ROW_COLORS[
      (((index.get(key) ?? 0) % ROW_COLORS.length) + ROW_COLORS.length) % ROW_COLORS.length
    ]!;
  const orderOf = (key: string) => index.get(key) ?? Number.POSITIVE_INFINITY;
  if (mode !== 'conversation') {
    // Worker mode: flat rows, sorted by first activity.
    const groups = new Map<string, RequestRecord[]>();
    for (const r of requests) {
      let list = groups.get(r.wid);
      if (!list) {
        list = [];
        groups.set(r.wid, list);
      }
      list.push(r);
    }
    const rows: RequestTimelineRow[] = [];
    for (const [key, list] of groups) {
      list.sort((a, b) => a.start - b.start);
      rows.push({
        key,
        label: shortenWid(key),
        color: colorFor(key),
        requests: list,
        depth: 0,
        kind: 'worker',
      });
    }
    rows.sort(
      (a, b) => orderOf(a.key) - orderOf(b.key) || a.requests[0]!.start - b.requests[0]!.start,
    );
    return rows;
  }

  // Conversation mode — tree: parent → subagent → stream/aux lane.
  interface SubagentLanes {
    streams: Map<number | null, RequestRecord[]>;
    aux: Map<string, RequestRecord[]>;
  }
  interface Tree {
    parentCid: string;
    parentReqs: RequestRecord[];
    // Aux lanes hanging directly off the main agent (`<cid>::aux:…`).
    parentAux: Map<string, RequestRecord[]>;
    // subagentBase → primary streams + always-visible auxiliary lanes.
    subagents: Map<string, SubagentLanes>;
    firstStart: number;
  }
  const trees = new Map<string, Tree>();
  for (const r of requests) {
    const { parent, subagentBase, stream, aux } = splitTimelineCid(r.cid);
    let tree = trees.get(parent);
    if (!tree) {
      tree = {
        parentCid: parent,
        parentReqs: [],
        parentAux: new Map(),
        subagents: new Map(),
        firstStart: Number.POSITIVE_INFINITY,
      };
      trees.set(parent, tree);
    }
    if (subagentBase === null && aux !== null) {
      const list = tree.parentAux.get(aux);
      if (list) list.push(r);
      else tree.parentAux.set(aux, [r]);
    } else if (subagentBase === null) {
      tree.parentReqs.push(r);
    } else {
      let lanes = tree.subagents.get(subagentBase);
      if (!lanes) {
        lanes = { streams: new Map(), aux: new Map() };
        tree.subagents.set(subagentBase, lanes);
      }
      if (aux === null) {
        const list = lanes.streams.get(stream);
        if (list) list.push(r);
        else lanes.streams.set(stream, [r]);
      } else {
        const list = lanes.aux.get(aux);
        if (list) list.push(r);
        else lanes.aux.set(aux, [r]);
      }
    }
    if (r.start < tree.firstStart) tree.firstStart = r.start;
  }

  const sortedTrees = [...trees.values()].toSorted(
    (a, b) => orderOf(a.parentCid) - orderOf(b.parentCid) || a.firstStart - b.firstStart,
  );
  const rows: RequestTimelineRow[] = [];
  for (const tree of sortedTrees) {
    const color = colorFor(tree.parentCid);
    // Parent row (use a placeholder key if the parent itself wasn't replayed).
    tree.parentReqs.sort((a, b) => a.start - b.start);
    const parentRowKey = tree.parentReqs.length > 0 ? tree.parentCid : `__parent_${tree.parentCid}`;
    rows.push({
      key: parentRowKey,
      label: tree.parentCid,
      color,
      requests: tree.parentReqs,
      depth: 0,
      kind: 'parent',
    });

    // Aux lanes belonging to the main agent itself (`<cid>::aux:…`), nested
    // directly beneath the parent row. Always visible, like subagent aux lanes.
    const parentAuxEntries = [...tree.parentAux.entries()].toSorted(
      (a, b) =>
        (a[1][0]?.start ?? Number.POSITIVE_INFINITY) - (b[1][0]?.start ?? Number.POSITIVE_INFINITY),
    );
    for (const [auxId, reqs] of parentAuxEntries) {
      reqs.sort((a, b) => a.start - b.start);
      rows.push({
        key: `${tree.parentCid}::aux:${auxId}`,
        label: `aux ${auxId} · parallel`,
        color,
        requests: reqs,
        depth: 1,
        kind: 'aux',
        parentRowKey,
      });
    }

    // One subagent row per base (which may contain N streams).
    const subagentEntries = [...tree.subagents.entries()].toSorted((a, b) => {
      const aStart = Math.min(
        ...[...a[1].streams.values(), ...a[1].aux.values()].map(
          (reqs) => reqs[0]?.start ?? Number.POSITIVE_INFINITY,
        ),
      );
      const bStart = Math.min(
        ...[...b[1].streams.values(), ...b[1].aux.values()].map(
          (reqs) => reqs[0]?.start ?? Number.POSITIVE_INFINITY,
        ),
      );
      return aStart - bStart;
    });
    for (const [saBase, lanes] of subagentEntries) {
      const subagentKey = `${tree.parentCid}::sa:${saBase}`;
      // Union of primary stream requests for collapsed-view bars. Aux lanes
      // stay separate so their overlap remains visible as parallel work.
      const allReqs: RequestRecord[] = [];
      for (const reqs of lanes.streams.values()) allReqs.push(...reqs);
      allReqs.sort((a, b) => a.start - b.start);
      const streamCount = lanes.streams.size;
      rows.push({
        key: subagentKey,
        label: `↳ ${formatSubagentLabel(saBase)}`,
        color,
        requests: allReqs,
        depth: 1,
        kind: 'subagent',
        streamCount,
        auxCount: lanes.aux.size,
      });

      // Stream children only when expanded AND there's more than one
      // stream (a single-stream subagent has nothing extra to show).
      if (streamCount > 1 && expandedSubagents.has(subagentKey)) {
        const streamEntries = [...lanes.streams.entries()].toSorted((a, b) => {
          // Sort by stream index (null first as the "default" stream)
          const ai = a[0] ?? -1;
          const bi = b[0] ?? -1;
          return ai - bi;
        });
        for (const [streamIdx, reqs] of streamEntries) {
          reqs.sort((a, b) => a.start - b.start);
          rows.push({
            key: `${subagentKey}:s${streamIdx ?? '∅'}`,
            label: `stream ${streamIdx ?? '∅'}`,
            color,
            requests: reqs,
            depth: 2,
            kind: 'stream',
            parentRowKey: subagentKey,
          });
        }
      }

      // Aux lanes encode concurrent requests within the subagent. Keep them
      // visible even when primary streams are collapsed so parallelism is not
      // hidden behind an interaction.
      const auxEntries = [...lanes.aux.entries()].toSorted(
        (a, b) =>
          (a[1][0]?.start ?? Number.POSITIVE_INFINITY) -
          (b[1][0]?.start ?? Number.POSITIVE_INFINITY),
      );
      for (const [auxId, reqs] of auxEntries) {
        reqs.sort((a, b) => a.start - b.start);
        rows.push({
          key: `${subagentKey}:aux:${auxId}`,
          label: `aux ${auxId} · parallel`,
          color,
          requests: reqs,
          depth: 2,
          kind: 'aux',
          parentRowKey: subagentKey,
        });
      }
    }
  }
  return rows;
}

/** `subagent_001_bf1c5c16` → `subagent 001 · bf1c` (compact, readable). */
function formatSubagentLabel(raw: string): string {
  const m = /^subagent_(?<index>\d+)_(?<hash>[0-9a-f]+)$/iu.exec(raw);
  if (!m) return raw;
  return `subagent ${m[1]} · ${m[2]!.slice(0, 4)}`;
}

/** `worker_4ae87bea` → `w_4ae8` (compact worker swimlane label). */
export function shortenWid(wid: string): string {
  return wid.replace(/^worker_/, 'w_').slice(0, 12);
}
