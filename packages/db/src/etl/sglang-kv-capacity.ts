import type { TransactionSql } from 'postgres';

import type { MetricsMap } from './compute-chart-series.js';
import type { Sql } from './db-utils.js';

export const SGLANG_KV_CAPACITY_METRIC = 'sglang:max_total_num_tokens';
const SHARD_LABELS = new Set(['tp_rank', 'pp_rank', 'ep_rank', 'moe_ep_rank']);

/** Sum logical pools, retaining worker/endpoint and DP identity, not TP replicas. */
export function sglangKvCachePoolTokensFromMetricPhases(
  profiling: MetricsMap,
  warmup: MetricsMap,
): number | null {
  const pools = new Map<string, number>();
  for (const phase of [profiling, warmup]) {
    for (const series of phase[SGLANG_KV_CAPACITY_METRIC]?.series ?? []) {
      const labels = series.labels ?? {};
      const worker = labels.worker_id?.trim() || series.endpoint_url?.trim();
      // Without an explicit worker and shard label, ownership is ambiguous.
      if (!worker || !/^\d+$/u.test(labels.tp_rank ?? '')) return null;
      const identity = JSON.stringify([
        worker,
        Object.entries(labels)
          .filter(([name]) => !SHARD_LABELS.has(name))
          .sort(([a], [b]) => a.localeCompare(b)),
      ]);
      let observed = false;
      for (const slice of series.timeslices ?? []) {
        const value = slice.avg;
        if (value === undefined || value === 0) continue;
        if (!Number.isSafeInteger(value) || value < 0) return null;
        const previous = pools.get(identity);
        // Disagreeing shards or changing pools cannot define one constant ceiling.
        if (previous !== undefined && previous !== value) return null;
        pools.set(identity, value);
        observed = true;
      }
      if (!observed) return null;
    }
  }
  const tokens = [...pools.values()].reduce((sum, value) => sum + value, 0);
  return tokens > 0 && Number.isSafeInteger(tokens) ? tokens : null;
}

/** The same scoped, idempotent write serves ingestion and artifact-backed recovery. */
export async function updateSglangKvCachePoolTokens(
  sql: Sql | TransactionSql,
  benchmarkIds: readonly number[],
  tokens: number | null,
): Promise<void> {
  if (
    tokens === null ||
    !Number.isSafeInteger(tokens) ||
    tokens <= 0 ||
    benchmarkIds.length === 0
  ) {
    return;
  }
  await sql`
    update benchmark_results br
    set metrics = jsonb_set(br.metrics, '{kv_cache_pool_tokens}', to_jsonb(${tokens}::bigint))
    from configs c
    where c.id = br.config_id
      and c.framework in ('sglang', 'mori-sglang', 'dynamo-sglang')
      and br.id = any(${sql.array([...benchmarkIds])}::bigint[])
      and br.metrics ->> 'kv_cache_pool_tokens' is distinct from ${String(tokens)}
  `;
}
