export const DEFAULT_BLOCK_SIZE = 64;

export interface RawWekaRequest {
  t?: number;
  type?: string;
  model?: string;
  in?: number;
  out?: number;
  hash_ids?: number[];
  api_time?: number;
}

export interface RawWekaSubagent {
  t?: number;
  type: 'subagent';
  agent_id?: string;
  subagent_type?: string;
  duration_ms?: number;
  requests?: RawWekaRequest[];
  models?: string[];
}

export type RawWekaEntry = RawWekaRequest | RawWekaSubagent;

export interface RawWekaConversation {
  id: string;
  models?: string[];
  block_size?: number;
  hash_id_scope?: string;
  requests?: RawWekaEntry[];
}

export interface TurnNode {
  kind: 'turn';
  turnIndex: number;
  rawIndex?: number;
  innerIndex?: number;
  startS?: number;
  endS?: number;
  model?: string;
  in: number;
  out: number;
  cached: number;
  uncached: number;
}

export interface SubagentNode {
  kind: 'subagent';
  label: string;
  agentId?: string;
  rawIndex?: number;
  startS?: number;
  endS?: number;
  durationMs?: number;
  in: number;
  out: number;
  cached: number;
  uncached: number;
  children: TurnNode[];
}

export type StructureNode = TurnNode | SubagentNode;

export interface ConversationStructure {
  blockSize: number;
  nodes: StructureNode[];
  totals: {
    in: number;
    out: number;
    cached: number;
    uncached: number;
    numTurns: number;
    numSubagentGroups: number;
  };
}

export function countConversationRequests(structure: ConversationStructure): number {
  return structure.totals.numTurns + subagentRequestTurns(structure).length;
}

export function subagentRequestTurns(structure: ConversationStructure): TurnNode[] {
  return structure.nodes.flatMap((node) => (node.kind === 'subagent' ? node.children : []));
}

const isSubagent = (e: RawWekaEntry): e is RawWekaSubagent =>
  (e as RawWekaSubagent).type === 'subagent';

export function countSeenPrefixBlocks(
  hashIds: readonly number[],
  seen: ReadonlySet<number>,
): number {
  let hits = 0;
  for (const h of hashIds) {
    if (!seen.has(h)) break;
    hits += 1;
  }
  return hits;
}

function splitInput(
  req: RawWekaRequest,
  seen: Set<number>,
  blockSize: number,
): { in: number; cached: number; uncached: number } {
  const input = Math.max(0, Math.round(req.in ?? 0));
  const hashIds = req.hash_ids ?? [];
  if (hashIds.length === 0) {
    return { in: input, cached: 0, uncached: input };
  }
  const cachedBlocks = countSeenPrefixBlocks(hashIds, seen);
  for (const h of hashIds) seen.add(h);
  const cached = Math.min(input, cachedBlocks * blockSize);
  return { in: input, cached, uncached: input - cached };
}

function subagentLabel(s: RawWekaSubagent): string {
  const base = s.subagent_type?.trim();
  return base && base.length > 0 ? base : 'Subagent';
}

function finiteTime(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function requestEndS(startS: number | undefined, apiTime: number | undefined): number | undefined {
  if (startS === undefined) return undefined;
  const duration = finiteTime(apiTime) ?? 0;
  return startS + duration;
}

function subagentRequestStartS(
  entry: RawWekaSubagent,
  request: RawWekaRequest,
): number | undefined {
  const requestStart = finiteTime(request.t);
  if (requestStart === undefined) return undefined;
  const groupStart = finiteTime(entry.t);
  if (groupStart !== undefined && requestStart + 1e-6 < groupStart) {
    return groupStart + requestStart;
  }
  return requestStart;
}

function subagentTimeRange(entry: RawWekaSubagent): { startS?: number; endS?: number } {
  const children = entry.requests ?? [];
  const childStarts = children
    .map((child) => subagentRequestStartS(entry, child))
    .filter((value): value is number => value !== undefined);
  const startS =
    finiteTime(entry.t) ?? (childStarts.length > 0 ? Math.min(...childStarts) : undefined);
  const durationMs = finiteTime(entry.duration_ms);
  if (startS !== undefined && durationMs !== undefined) {
    return { startS, endS: startS + durationMs / 1000 };
  }

  const childEnds = children
    .map((child) => {
      const childStart = subagentRequestStartS(entry, child);
      if (childStart === undefined) return undefined;
      return childStart + (finiteTime(child.api_time) ?? 0);
    })
    .filter((value): value is number => value !== undefined);
  return {
    startS,
    endS: childEnds.length > 0 ? Math.max(...childEnds) : startS,
  };
}

export function buildConversationStructure(
  conv: RawWekaConversation,
  blockSizeOverride?: number,
): ConversationStructure {
  const blockSize = blockSizeOverride ?? conv.block_size ?? DEFAULT_BLOCK_SIZE;
  const seen = new Set<number>();
  const nodes: StructureNode[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalCached = 0;
  let totalUncached = 0;
  let numTurns = 0;
  let numSubagentGroups = 0;
  let turnIndex = 0;

  for (const [idx, entry] of (conv.requests ?? []).entries()) {
    if (isSubagent(entry)) {
      const { startS, endS } = subagentTimeRange(entry);
      const childSeen = new Set(seen);
      const children: TurnNode[] = [];
      let gin = 0;
      let gout = 0;
      let gcached = 0;
      let guncached = 0;
      for (const [innerIdx, inner] of (entry.requests ?? []).entries()) {
        const split = splitInput(inner, childSeen, blockSize);
        const out = Math.max(0, Math.round(inner.out ?? 0));
        const childStartS = subagentRequestStartS(entry, inner);
        children.push({
          kind: 'turn',
          turnIndex: turnIndex++,
          rawIndex: idx,
          innerIndex: innerIdx,
          startS: childStartS,
          endS: requestEndS(childStartS, inner.api_time),
          model: inner.model,
          in: split.in,
          out,
          cached: split.cached,
          uncached: split.uncached,
        });
        gin += split.in;
        gout += out;
        gcached += split.cached;
        guncached += split.uncached;
      }
      nodes.push({
        kind: 'subagent',
        label: subagentLabel(entry),
        agentId: entry.agent_id,
        rawIndex: idx,
        startS,
        endS,
        durationMs: entry.duration_ms,
        in: gin,
        out: gout,
        cached: gcached,
        uncached: guncached,
        children,
      });
      numSubagentGroups += 1;
      totalIn += gin;
      totalOut += gout;
      totalCached += gcached;
      totalUncached += guncached;
    } else {
      const split = splitInput(entry, seen, blockSize);
      const out = Math.max(0, Math.round(entry.out ?? 0));
      const startS = finiteTime(entry.t);
      nodes.push({
        kind: 'turn',
        turnIndex: turnIndex++,
        rawIndex: idx,
        startS,
        endS: requestEndS(startS, entry.api_time),
        model: entry.model,
        in: split.in,
        out,
        cached: split.cached,
        uncached: split.uncached,
      });
      numTurns += 1;
      totalIn += split.in;
      totalOut += out;
      totalCached += split.cached;
      totalUncached += split.uncached;
    }
  }

  return {
    blockSize,
    nodes,
    totals: {
      in: totalIn,
      out: totalOut,
      cached: totalCached,
      uncached: totalUncached,
      numTurns,
      numSubagentGroups,
    },
  };
}

export {
  linearHistogram,
  logHistogram,
  logHistogramWithZero,
  summarizeValues,
  type HistogramBin,
  type NumberSummary,
} from './distribution-stats';
