import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { chain } from 'stream-chain';

import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

import { gunzipJsonWithinLimit } from '../etl/gzip-json-stream';
import type { DbClient } from '../connection.js';
import { computeStoredProfileDistributions } from './derived-agentic-metrics';
import {
  fetchAggregateStatsRows,
  percentilesOf,
  sequenceLengthSketches,
  STATS_VERSION,
  writeBackTraceReplayJsonb,
  type MetricPercentiles,
  type SequenceLengthSketches,
} from './agentic-shared';

export {
  extractIslOsl,
  percentilesOf,
  sequenceLengthSketches,
  STATS_VERSION,
  type MetricPercentiles,
  type SequenceLengthSketches,
} from './agentic-shared';

export interface AgenticAggregate {
  id: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

export type AgenticAggregateMap = Record<number, AgenticAggregate>;

const PROFILE_CHUNK_SIZE = 8;
const SERVER_CHUNK_SIZE = 1;

interface TimeSlice {
  start_ns?: number;
  end_ns?: number;
  avg?: number;
  rate?: number;
  count?: number;
  sum?: number;
}
interface Series {
  labels?: Record<string, string>;
  timeslices?: TimeSlice[];
}
interface MetricMeta {
  series?: Series[];
}
interface MetricsJson {
  metrics?: Record<string, MetricMeta>;
}

function aggregateSeriesByStart(
  metricSeries: readonly Series[] | undefined,
  field: 'avg' | 'rate',
  combine: 'sum' | 'avg',
): Map<number, number> {
  const sums = new Map<number, number>();
  const counts = new Map<number, number>();
  for (const s of metricSeries ?? []) {
    for (const ts of s.timeslices ?? []) {
      if (typeof ts.start_ns !== 'number') continue;
      const v = ts[field];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      sums.set(ts.start_ns, (sums.get(ts.start_ns) ?? 0) + v);
      counts.set(ts.start_ns, (counts.get(ts.start_ns) ?? 0) + 1);
    }
  }
  if (combine === 'sum') return sums;
  const out = new Map<number, number>();
  for (const [t, s] of sums) out.set(t, s / (counts.get(t) ?? 1));
  return out;
}

function pickFirstNonEmpty(
  metrics: Record<string, MetricMeta>,
  ...names: string[]
): Series[] | undefined {
  for (const name of names) {
    const s = metrics[name]?.series;
    if (s && s.length > 0) return s;
  }
  return undefined;
}

export function extractServerMetricSamples(json: string): {
  kvCacheUtil: number[];
  prefixCacheHitRate: number[];
} {
  const parsed = JSON.parse(json) as MetricsJson;
  const metrics = parsed.metrics ?? {};

  const kvSeriesAll = pickFirstNonEmpty(
    metrics,
    'vllm:kv_cache_usage_perc',
    'vllm:gpu_cache_usage_perc',
    'sglang:token_usage',
    'atom:kv_cache_usage_ratio',
    'trtllm_kv_cache_utilization',
  );
  const kvCacheUtil = [...aggregateSeriesByStart(kvSeriesAll, 'avg', 'avg').values()];

  const hitsAll = pickFirstNonEmpty(
    metrics,
    'vllm:prefix_cache_hits',
    'vllm:gpu_prefix_cache_hits',
    'sglang:cached_tokens',
    'atom:prefix_cache_cached_tokens',
    'trtllm_prompt_cached_tokens',
    'trtllm_prompt_cached_tokens_total',
  );
  const queriesAll = pickFirstNonEmpty(
    metrics,
    'vllm:prefix_cache_queries',
    'vllm:gpu_prefix_cache_queries',
    'vllm:prompt_tokens',
    'sglang:prompt_tokens',
    'atom:prefix_cache_full_tokens',
    'trtllm_prompt_tokens',
    'trtllm_prompt_tokens_total',
  );
  const hitsByT = aggregateSeriesByStart(hitsAll, 'rate', 'sum');
  const qByT = aggregateSeriesByStart(queriesAll, 'rate', 'sum');
  const prefixCacheHitRate: number[] = [];
  for (const [t, h] of hitsByT) {
    const q = qByT.get(t);
    if (q !== undefined && q > 0) prefixCacheHitRate.push(h / q);
  }
  if (prefixCacheHitRate.length === 0) {
    const directRate = aggregateSeriesByStart(
      pickFirstNonEmpty(metrics, 'trtllm_kv_cache_hit_rate', 'atom:prefix_cache_hit_ratio'),
      'avg',
      'avg',
    );
    prefixCacheHitRate.push(...directRate.values());
  }

  return { kvCacheUtil, prefixCacheHitRate };
}

const TARGET_METRIC_KEYS = new Set([
  'vllm:kv_cache_usage_perc',
  'vllm:gpu_cache_usage_perc',
  'vllm:prefix_cache_hits',
  'vllm:prefix_cache_queries',
  'vllm:gpu_prefix_cache_hits',
  'vllm:gpu_prefix_cache_queries',
  'vllm:prompt_tokens',
  'sglang:token_usage',
  'sglang:cached_tokens',
  'sglang:prompt_tokens',
  'atom:kv_cache_usage_ratio',
  'atom:prefix_cache_cached_tokens',
  'atom:prefix_cache_full_tokens',
  'atom:prefix_cache_hit_ratio',
  'trtllm_kv_cache_utilization',
  'trtllm_kv_cache_hit_rate',
  'trtllm_prompt_cached_tokens',
  'trtllm_prompt_cached_tokens_total',
  'trtllm_prompt_tokens',
  'trtllm_prompt_tokens_total',
]);

async function streamExtractServerMetricSamples(
  buffer: Buffer,
): Promise<{ kvCacheUtil: number[]; prefixCacheHitRate: number[] }> {
  const collected: Record<string, MetricMeta> = {};
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pipeline = chain([
    Readable.from(buffer),
    createGunzip(),
    parser(),
    pick({ filter: 'metrics' }),
    streamObject(),
  ]);
  await new Promise<void>((resolve, reject) => {
    (pipeline as any).on('data', (chunk: unknown) => {
      const { key, value } = chunk as { key: string; value: MetricMeta };
      if (TARGET_METRIC_KEYS.has(key)) collected[key] = value;
    });
    (pipeline as any).on('end', resolve);
    (pipeline as any).on('error', reject);
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return extractServerMetricSamples(JSON.stringify({ metrics: collected }));
}

export async function getAgenticAggregates(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<AgenticAggregateMap> {
  if (benchmarkResultIds.length === 0) return {};

  const result: AgenticAggregateMap = {};

  const statsRows = await fetchAggregateStatsRows<AggregateStatsRow>(sql, benchmarkResultIds);

  const idsNeedingProfile: number[] = [];
  const idsNeedingServer: number[] = [];
  for (const row of statsRows) {
    const id = Number(row.benchmark_result_id);
    const agg = blankAggregate(id);
    if (row.stats && Number(row.stats.version) === STATS_VERSION) {
      agg.isl = row.stats.isl ?? null;
      agg.osl = row.stats.osl ?? null;
      agg.kvCacheUtil = row.stats.kvCacheUtil ?? null;
      agg.prefixCacheHitRate = row.stats.prefixCacheHitRate ?? null;
    } else {
      idsNeedingProfile.push(id);
      idsNeedingServer.push(id);
    }
    result[id] = agg;
  }
  for (const id of benchmarkResultIds) {
    if (!(id in result)) result[id] = blankAggregate(id);
  }

  if (idsNeedingProfile.length === 0 && idsNeedingServer.length === 0) {
    return result;
  }

  const pendingById = new Map<number, { traceReplayId: number; stats: FullAggregateStats }>();

  for (let i = 0; i < idsNeedingProfile.length; i += PROFILE_CHUNK_SIZE) {
    const chunk = idsNeedingProfile.slice(i, i + PROFILE_CHUNK_SIZE);
    const rows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.id as trace_replay_id,
        (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0) as has_profile
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as {
      benchmark_result_id: number;
      trace_replay_id: number;
      has_profile: boolean;
    }[];
    for (const row of rows) {
      const id = Number(row.benchmark_result_id);
      result[id] ??= blankAggregate(id);
      if (row.has_profile) {
        try {
          const { isl, osl, e2el_per_osl } = await computeStoredProfileDistributions(
            sql,
            Number(row.trace_replay_id),
          );
          const islPct = percentilesOf(isl);
          const oslPct = percentilesOf(osl);
          result[id].isl = islPct;
          result[id].osl = oslPct;
          pendingById.set(id, {
            traceReplayId: Number(row.trace_replay_id),
            stats: {
              version: STATS_VERSION,
              isl: islPct,
              osl: oslPct,
              kvCacheUtil: null,
              prefixCacheHitRate: null,
              e2elPerOsl: e2el_per_osl,
              sequenceLengths: sequenceLengthSketches(isl, osl),
            },
          });
        } catch {}
      }
    }
  }
  for (let i = 0; i < idsNeedingServer.length; i += SERVER_CHUNK_SIZE) {
    const chunk = idsNeedingServer.slice(i, i + SERVER_CHUNK_SIZE);
    const rows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.server_metrics_json_gz as server_blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as { benchmark_result_id: number; server_blob: Buffer | null }[];
    for (const row of rows) {
      const id = Number(row.benchmark_result_id);
      result[id] ??= blankAggregate(id);
      if (!row.server_blob) continue;
      let parsed: { kvCacheUtil: number[]; prefixCacheHitRate: number[] } | null = null;
      try {
        const json = gunzipJsonWithinLimit(row.server_blob);
        parsed =
          json === null
            ? await streamExtractServerMetricSamples(row.server_blob)
            : extractServerMetricSamples(json);
      } catch {}
      if (parsed) {
        const kvPct = percentilesOf(parsed.kvCacheUtil);
        const prefixPct = percentilesOf(parsed.prefixCacheHitRate);
        result[id].kvCacheUtil = kvPct;
        result[id].prefixCacheHitRate = prefixPct;
        const pending = pendingById.get(id);
        if (pending) {
          pending.stats.kvCacheUtil = kvPct;
          pending.stats.prefixCacheHitRate = prefixPct;
        }
      }
    }
  }

  for (const { traceReplayId, stats } of pendingById.values()) {
    writeBackTraceReplayJsonb(sql, 'aggregate_stats', traceReplayId, stats);
  }

  return result;
}

interface AggregateStatsRow {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

interface FullAggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  e2elPerOsl: MetricPercentiles | null;
  sequenceLengths: SequenceLengthSketches;
}

function blankAggregate(id: number): AgenticAggregate {
  return { id, isl: null, osl: null, kvCacheUtil: null, prefixCacheHitRate: null };
}
