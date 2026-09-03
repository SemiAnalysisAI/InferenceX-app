import type { TransactionSql } from 'postgres';

import type { MetricsMap } from './compute-chart-series.js';
import type { Sql } from './db-utils.js';

export const ATOM_KV_BLOCKS_METRIC = 'atom:kv_cache_blocks_total';

/** ATOM already sums independent DP pools; phase/endpoint copies are not extra pools. */
export function atomKvCacheBlocksFromMetricPhases(
  profiling: MetricsMap,
  warmup: MetricsMap,
): number | null {
  let blocks: number | null = null;
  for (const phase of [profiling, warmup]) {
    for (const series of phase[ATOM_KV_BLOCKS_METRIC]?.series ?? []) {
      for (const slice of series.timeslices ?? []) {
        const value = slice.avg;
        if (value === undefined || value === 0) continue;
        if (!Number.isSafeInteger(value) || value < 0) return null;
        // A resized/restarted pool cannot be represented by one constant ceiling.
        if (blocks !== null && value !== blocks) return null;
        blocks = value;
      }
    }
  }
  return blocks;
}

/** Use the resolved scheduler block size, not the pre-normalization CLI value. */
export function atomKvCachePoolTokensFromServerLog(
  serverLog: string,
  allocatedBlocks: number,
): number | null {
  if (!Number.isSafeInteger(allocatedBlocks) || allocatedBlocks <= 0) return null;
  let scale: number | null = null;
  for (const line of serverLog.split('\n')) {
    if (!line.includes('Concurrent capacity vs context length')) continue;
    const blockSize = /\bblock_size=(?<size>\d+)(?=[,)])/u.exec(line);
    const poolBlocks = /\bpool_blocks=(?<blocks>\d+)(?=[,)])/u.exec(line);
    if (!blockSize || !poolBlocks || Number(poolBlocks.groups!.blocks) <= 0) return null;
    const dcp = /\bdcp=(?<width>\d+)(?=[ ,)])/u.exec(line);
    if (line.includes('dcp=') && !dcp) return null;
    // DCP stores one shard per rank; TP replicas do not multiply capacity.
    const next = Number(blockSize.groups!.size) * (dcp ? Number(dcp.groups!.width) : 1);
    if (!Number.isSafeInteger(next) || next <= 0 || (scale !== null && scale !== next)) {
      return null;
    }
    scale = next;
  }
  const tokens = scale === null ? null : allocatedBlocks * scale;
  return tokens !== null && Number.isSafeInteger(tokens) ? tokens : null;
}

/** Share the exact ingestion/backfill write, returning only compact startup lines from SQL. */
export async function updateAtomKvCachePoolTokens(
  sql: Sql | TransactionSql,
  benchmarkIds: readonly number[],
  allocatedBlocks: number | null,
): Promise<number> {
  if (allocatedBlocks === null || benchmarkIds.length === 0) return 0;
  const rows = await sql<{ id: number; capacity_log: string }[]>`
    select br.id, string_agg(line.parts[1], E'\n') as capacity_log
    from benchmark_results br
    join configs c on c.id = br.config_id
    join server_logs sl on sl.id = br.server_log_id
    cross join lateral regexp_matches(
      sl.server_log, 'Concurrent capacity vs context length[^\r\n]*', 'g'
    ) as line(parts)
    where br.id = any(${sql.array([...benchmarkIds])}::bigint[])
      and c.framework = 'atom' and not c.disagg
    group by br.id
  `;
  let parsed = 0;
  for (const row of rows) {
    const tokens = atomKvCachePoolTokensFromServerLog(row.capacity_log, allocatedBlocks);
    if (tokens === null) continue;
    await sql`
      update benchmark_results
      set metrics = jsonb_set(metrics, '{kv_cache_pool_tokens}', to_jsonb(${tokens}::bigint))
      where id = ${row.id}
        and (metrics ->> 'kv_cache_pool_tokens')::bigint is distinct from ${tokens}::bigint
    `;
    parsed++;
  }
  return parsed;
}
