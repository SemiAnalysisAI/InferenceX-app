import type { DbClient } from '../connection.js';

export type IdRuns = number[];

export interface BenchmarkPresence {
  trace: IdRuns;
  log: IdRuns;
}

export async function getBenchmarkPresence(sql: DbClient): Promise<BenchmarkPresence> {
  const rows = (await sql`
    select trace, string_agg((start - coalesce(previous_end, 0)) || ',' || length, ',' order by start) as runs
    from (
      select trace, start, length, lag(start + length) over (partition by trace order by start) as previous_end
      from benchmark_presence_runs
    ) r
    group by trace
  `) as { trace: boolean; runs: string }[];

  const presence: BenchmarkPresence = { trace: [], log: [] };
  for (const row of rows) presence[row.trace ? 'trace' : 'log'] = JSON.parse(`[${row.runs}]`);
  return presence;
}

/** Combine presence read from databases that hold disjoint id ranges. */
export function mergeBenchmarkPresence(parts: readonly BenchmarkPresence[]): BenchmarkPresence {
  if (parts.length === 1) return parts[0]!;
  return {
    trace: mergeIdRuns(parts.map((part) => part.trace)),
    log: mergeIdRuns(parts.map((part) => part.log)),
  };
}

function mergeIdRuns(parts: readonly IdRuns[]): IdRuns {
  const spans: [number, number][] = [];
  for (const runs of parts) {
    let end = 0;
    for (let r = 0; r < runs.length; r += 2) {
      const start = end + runs[r]!;
      end = start + runs[r + 1]!;
      spans.push([start, end]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: IdRuns = [];
  let previousEnd = 0;
  let open: [number, number] | null = null;
  for (const span of spans) {
    if (open && span[0] <= open[1]) {
      open[1] = Math.max(open[1], span[1]);
      continue;
    }
    if (open) {
      merged.push(open[0] - previousEnd, open[1] - open[0]);
      previousEnd = open[1];
    }
    open = span;
  }
  if (open) merged.push(open[0] - previousEnd, open[1] - open[0]);
  return merged;
}
