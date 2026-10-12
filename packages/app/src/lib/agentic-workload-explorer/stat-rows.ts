import { type SessionRequest } from '@/lib/agentic-workload-explorer/session-context';
import { buildRequestRuns } from '@/lib/agentic-workload-explorer/subagent-runs';

export type StatRow =
  | {
      kind: 'main';
      turn: number;
      requestId: string;
      timestamp: string;
      model: string | null;
      input: number;
      cacheRead: number;
      cacheWrite: number;
      output: number;
      cost: number;
      durationMs: number;
      ttftMs: number | null;
      tpotMs: number | null;
      hashIds: string[] | null;
      hashTokenCount: number | null;
      isClassifierLike: boolean;
    }
  | {
      kind: 'subagent_group';
      turn: number;
      requestId: string;
      timestamp: string;
      label: string;
      requestCount: number;
      model: string | null;
      input: number;
      cacheRead: number;
      cacheWrite: number;
      output: number;
      cost: number;
      durationMs: number;
      ttftMs: number | null;
      tpotMs: number | null;
      children: {
        requestId: string;
        timestamp: string;
        model: string | null;
        input: number;
        cacheRead: number;
        cacheWrite: number;
        output: number;
        cost: number;
        durationMs: number;
        ttftMs: number | null;
        tpotMs: number | null;
        hashIds: string[] | null;
        hashTokenCount: number | null;
        isClassifierLike: boolean;
      }[];
      classifierLikeCount: number;
    };

export type StatLeafRow =
  | Extract<StatRow, { kind: 'main' }>
  | Extract<StatRow, { kind: 'subagent_group' }>['children'][number];

interface ChronologicalStatLeaf {
  row: StatLeafRow;
  isSubagent: boolean;
}

/** Restore request chronology after buildRequestRuns collapses agent-id groups. */
export function flattenStatRowsChronologically(rows: StatRow[]): ChronologicalStatLeaf[] {
  const leaves: ChronologicalStatLeaf[] = [];
  for (const row of rows) {
    if (row.kind === 'main') {
      leaves.push({ row, isSubagent: false });
    } else {
      for (const child of row.children) leaves.push({ row: child, isSubagent: true });
    }
  }
  return leaves.toSorted(
    (a, b) =>
      new Date(a.row.timestamp).getTime() - new Date(b.row.timestamp).getTime() ||
      a.row.requestId.localeCompare(b.row.requestId),
  );
}

function isClassifierLikeResponse(responseBody: Record<string, unknown> | null): boolean {
  if (!responseBody) return false;
  const nestedBody = responseBody.body;
  const body =
    nestedBody && typeof nestedBody === 'object'
      ? (nestedBody as Record<string, unknown>)
      : responseBody;
  const stopReason = body.stopReason ?? body.stop_reason;
  const stopSequence = body.stopSequence ?? body.stop_sequence;
  return (
    stopReason === 'stop_sequence' &&
    (stopSequence === '</block>' || stopSequence === '</severity>')
  );
}

export function buildStatRows(requests: SessionRequest[]): StatRow[] {
  const rows: StatRow[] = [];
  let turn = 0;

  for (const run of buildRequestRuns(requests)) {
    turn++;

    if (run.kind === 'subagent_group') {
      const groupRequestId = run.requests[0].id;
      const groupTimestamp = run.requests[0].timestamp;
      let totalIn = 0,
        totalOut = 0,
        totalCacheRead = 0,
        totalCacheWrite = 0;
      let totalCost = 0,
        totalDuration = 0,
        count = 0;
      let firstTtftMs: number | null = null;
      let weightedTpotTotal = 0;
      let weightedTpotTokenCount = 0;
      const children: StatRow & { kind: 'subagent_group' } extends { children: infer C }
        ? C
        : never = [];
      let groupModel: string | null = null;
      let classifierLikeCount = 0;

      for (const sub of run.requests) {
        count++;
        if (!groupModel && sub.model) groupModel = sub.model;
        const inp = sub.inputTokens || 0;
        const out = sub.outputTokens || 0;
        const cr = sub.cacheReadInputTokens || 0;
        const cw = sub.cacheWriteTokens || 0;
        totalIn += inp;
        totalOut += out;
        totalCacheRead += cr;
        totalCacheWrite += cw;
        totalCost += sub.costUsd || 0;
        totalDuration += sub.durationMs || 0;
        firstTtftMs ??= sub.ttftMs;
        if (sub.tpotMs !== null && sub.outputTokens && sub.outputTokens > 1) {
          weightedTpotTotal += sub.tpotMs * (sub.outputTokens - 1);
          weightedTpotTokenCount += sub.outputTokens - 1;
        }
        const isClassifierLike = isClassifierLikeResponse(sub.responseBody);
        if (isClassifierLike) classifierLikeCount++;
        children.push({
          requestId: sub.id,
          timestamp: sub.timestamp,
          model: sub.model,
          input: inp,
          cacheRead: cr,
          cacheWrite: cw,
          output: out,
          cost: sub.costUsd || 0,
          durationMs: sub.durationMs || 0,
          ttftMs: sub.ttftMs,
          tpotMs: sub.tpotMs,
          hashIds: sub.hashIds,
          hashTokenCount: sub.hashTokenCount,
          isClassifierLike,
        });
      }

      rows.push({
        kind: 'subagent_group',
        turn,
        requestId: groupRequestId,
        timestamp: groupTimestamp,
        label: run.label,
        requestCount: count,
        model: groupModel,
        input: totalIn,
        cacheRead: totalCacheRead,
        cacheWrite: totalCacheWrite,
        output: totalOut,
        cost: totalCost,
        durationMs: totalDuration,
        ttftMs: firstTtftMs,
        tpotMs: weightedTpotTokenCount > 0 ? weightedTpotTotal / weightedTpotTokenCount : null,
        children,
        classifierLikeCount,
      });
    } else {
      const req = run.req;
      rows.push({
        kind: 'main',
        turn,
        requestId: req.id,
        timestamp: req.timestamp,
        model: req.model,
        input: req.inputTokens || 0,
        cacheRead: req.cacheReadInputTokens || 0,
        cacheWrite: req.cacheWriteTokens || 0,
        output: req.outputTokens || 0,
        cost: req.costUsd || 0,
        durationMs: req.durationMs || 0,
        ttftMs: req.ttftMs,
        tpotMs: req.tpotMs,
        hashIds: req.hashIds,
        hashTokenCount: req.hashTokenCount,
        isClassifierLike: isClassifierLikeResponse(req.responseBody),
      });
    }
  }

  return rows;
}
