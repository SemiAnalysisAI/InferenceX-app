import type { TransactionSql } from 'postgres';

import type { MetricsMap } from './compute-chart-series.js';
import type { Sql } from './db-utils.js';

export const ATOM_KV_BLOCKS_METRIC = 'atom:kv_cache_blocks_total';

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
        if (blocks !== null && value !== blocks) return null;
        blocks = value;
      }
    }
  }
  return blocks;
}

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
    const next = Number(blockSize.groups!.size) * (dcp ? Number(dcp.groups!.width) : 1);
    if (!Number.isSafeInteger(next) || next <= 0 || (scale !== null && scale !== next)) {
      return null;
    }
    scale = next;
  }
  const tokens = scale === null ? null : allocatedBlocks * scale;
  return tokens !== null && Number.isSafeInteger(tokens) ? tokens : null;
}

export const CAPACITY_SCAN_CHUNK_CHARS = 64 * 1024 * 1024;
export const CAPACITY_SCAN_OVERLAP_CHARS = 4096;

export async function collectAtomCapacityLines(
  sql: Sql | TransactionSql,
  serverLogId: number,
): Promise<string[]> {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += CAPACITY_SCAN_CHUNK_CHARS) {
    const rows = await sql<{ line: string | null; has_more: boolean }[]>`
      with chunk as materialized (
        select
          substring(
            sl.server_log
            from ${offset + 1}::integer
            for ${CAPACITY_SCAN_CHUNK_CHARS + CAPACITY_SCAN_OVERLAP_CHARS}::integer
          ) as chunk_text,
          substring(sl.server_log from ${offset + CAPACITY_SCAN_CHUNK_CHARS + 1}::integer for 1) <> ''
            as has_more
        from server_logs sl
        where sl.id = ${serverLogId}
      )
      select chunk.has_more, line.parts[1] as line
      from chunk
      left join lateral regexp_matches(
        case when chunk.has_more then chunk.chunk_text else chunk.chunk_text || E'\\n' end,
        'Concurrent capacity vs context length[^\r\n]*(?=[\r\n])',
        'g'
      ) as line(parts) on true
    `;
    for (const row of rows) {
      if (row.line === null || seen.has(row.line)) continue;
      seen.add(row.line);
      lines.push(row.line);
    }
    if (rows.length === 0 || !rows[0].has_more) return lines;
  }
}

export async function updateAtomKvCachePoolTokens(
  sql: Sql | TransactionSql,
  benchmarkIds: readonly number[],
  allocatedBlocks: number | null,
): Promise<number> {
  if (allocatedBlocks === null || benchmarkIds.length === 0) return 0;
  const rows = await sql<{ id: number; server_log_id: number }[]>`
    select br.id, br.server_log_id
    from benchmark_results br
    join configs c on c.id = br.config_id
    where br.id = any(${sql.array([...benchmarkIds])}::bigint[])
      and c.framework = 'atom' and not c.disagg
      and br.server_log_id is not null
    order by br.id
  `;
  let parsed = 0;
  for (const row of rows) {
    const capacityLines = await collectAtomCapacityLines(sql, row.server_log_id);
    const tokens = atomKvCachePoolTokensFromServerLog(capacityLines.join('\n'), allocatedBlocks);
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
