import { readTraceProfileLines } from '../lib/trace-profile-storage';

import type { DbClient } from '../connection.js';
import {
  extractIslOsl,
  fetchAggregateStatsRows,
  percentilesOf,
  readNum,
  sequenceLengthSketches,
  STATS_VERSION,
  writeBackTraceReplayJsonb,
  type MetricPercentiles,
  type SequenceLengthSketches,
} from './agentic-shared';

export interface DerivedAgenticMetric {
  id: number;
  p75_e2e_norm_intvty: number | null;
  p90_e2e_norm_intvty: number | null;
}

export type DerivedAgenticMetricMap = Record<number, DerivedAgenticMetric>;

interface StoredAggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  e2elPerOsl: MetricPercentiles | null;
  sequenceLengths: SequenceLengthSketches;
}

const QUERY_CHUNK_SIZE = 6;

interface RecordMetrics {
  request_latency?: { value?: number; unit?: string } | number;
  time_to_first_token?: { value?: number; unit?: string } | number;
  input_sequence_length?: { value?: number } | number;
  output_sequence_length?: { value?: number } | number;
}

interface RecordMetadata {
  conversation_id?: string;
  turn_index?: number;
  benchmark_phase?: string;
}

interface ProfileRecord {
  metadata?: RecordMetadata;
  metrics?: RecordMetrics;
}

interface TurnFields {
  request_latency_ms: number;
  ttft_ms: number;
  isl: number;
  osl: number;
}

function extractTurn(rec: ProfileRecord): TurnFields | null {
  const m = rec.metrics ?? {};
  const rl = readNum(m.request_latency);
  const tt = readNum(m.time_to_first_token);
  const isl = readNum(m.input_sequence_length);
  const osl = readNum(m.output_sequence_length);
  if (rl === undefined || tt === undefined || isl === undefined || osl === undefined) return null;
  if (rl <= 0 || tt <= 0 || isl <= 0 || osl <= 0) return null;
  return { request_latency_ms: rl, ttft_ms: tt, isl, osl };
}

function invertRatio(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? 1 / v : null;
}

export function computeDerivedFromBlob(jsonl: string): {
  e2el_per_osl: MetricPercentiles | null;
} {
  const ratios: number[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line) continue;
    let rec: ProfileRecord;
    try {
      rec = JSON.parse(line) as ProfileRecord;
    } catch {
      continue;
    }
    if (rec.metadata?.benchmark_phase && rec.metadata.benchmark_phase !== 'profiling') continue;
    const turn = extractTurn(rec);
    if (!turn) continue;
    ratios.push(turn.request_latency_ms / 1000 / turn.osl);
  }
  return { e2el_per_osl: percentilesOf(ratios) };
}

export async function computeStoredProfileDistributions(sql: DbClient, traceReplayId: number) {
  const isl: number[] = [];
  const osl: number[] = [];
  const ratios: number[] = [];
  for await (const line of readTraceProfileLines(sql, traceReplayId)) {
    const lengths = extractIslOsl(line);
    isl.push(...lengths.isl);
    osl.push(...lengths.osl);
    if (!line) continue;
    let record: ProfileRecord;
    try {
      record = JSON.parse(line) as ProfileRecord;
    } catch {
      continue;
    }
    if (record.metadata?.benchmark_phase && record.metadata.benchmark_phase !== 'profiling')
      continue;
    const turn = extractTurn(record);
    if (turn) ratios.push(turn.request_latency_ms / 1000 / turn.osl);
  }
  return { isl, osl, e2el_per_osl: percentilesOf(ratios) };
}

export async function getDerivedAgenticMetrics(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<DerivedAgenticMetricMap> {
  if (benchmarkResultIds.length === 0) return {};

  const result: DerivedAgenticMetricMap = {};

  const statsRows = await fetchAggregateStatsRows<StoredAggregateStats>(sql, benchmarkResultIds);

  const idsNeedingBlob: number[] = [];
  const staleStatsById = new Map<number, StoredAggregateStats | null>();
  for (const row of statsRows) {
    const id = Number(row.benchmark_result_id);
    if (row.stats && Number(row.stats.version) === STATS_VERSION) {
      result[id] = {
        id,
        p75_e2e_norm_intvty: invertRatio(row.stats.e2elPerOsl?.p75),
        p90_e2e_norm_intvty: invertRatio(row.stats.e2elPerOsl?.p90),
      };
    } else {
      idsNeedingBlob.push(id);
      staleStatsById.set(id, row.stats ?? null);
    }
  }

  if (idsNeedingBlob.length === 0) return result;

  const rows: {
    benchmark_result_id: number;
    trace_replay_id: number;
  }[] = [];
  for (let i = 0; i < idsNeedingBlob.length; i += QUERY_CHUNK_SIZE) {
    const chunk = idsNeedingBlob.slice(i, i + QUERY_CHUNK_SIZE);
    const chunkRows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.id as trace_replay_id
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
        and (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0)
    `) as { benchmark_result_id: number; trace_replay_id: number }[];
    rows.push(...chunkRows);
  }

  for (const row of rows) {
    const id = Number(row.benchmark_result_id);
    try {
      const { isl, osl, e2el_per_osl } = await computeStoredProfileDistributions(
        sql,
        Number(row.trace_replay_id),
      );
      result[id] = {
        id,
        p75_e2e_norm_intvty: invertRatio(e2el_per_osl?.p75),
        p90_e2e_norm_intvty: invertRatio(e2el_per_osl?.p90),
      };

      const prior = staleStatsById.get(id) ?? null;
      const canPreserveServerFields = Boolean(prior?.kvCacheUtil || prior?.prefixCacheHitRate);
      if (canPreserveServerFields) {
        const merged: StoredAggregateStats = {
          version: STATS_VERSION,
          isl: percentilesOf(isl),
          osl: percentilesOf(osl),
          kvCacheUtil: prior?.kvCacheUtil ?? null,
          prefixCacheHitRate: prior?.prefixCacheHitRate ?? null,
          e2elPerOsl: e2el_per_osl,
          sequenceLengths: sequenceLengthSketches(isl, osl),
        };
        writeBackTraceReplayJsonb(sql, 'aggregate_stats', Number(row.trace_replay_id), merged);
      }
    } catch {}
  }
  return result;
}
