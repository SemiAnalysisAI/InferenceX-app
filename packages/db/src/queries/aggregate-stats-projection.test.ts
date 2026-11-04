import { gzipSync } from 'node:zlib';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildTokenLengthSketch,
  mergeTokenLengthSketches,
} from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection';
import { encodeSequenceLengthSketches } from '../etl/sequence-length-sketch-codec';
import { migratedPglite, pgliteSql } from '../lib/test-pglite';
import { getAgenticAggregates } from './agentic-aggregates';
import {
  SEQUENCE_LENGTH_SKETCHES_VERSION,
  STATS_VERSION,
  sequenceLengthSketchColumns,
} from './agentic-shared';
import { getDerivedAgenticMetrics } from './derived-agentic-metrics';
import { getResidentSequenceLengthSketches } from './resident-sequence-lengths';

const ISL = { mean: 1100, p50: 1000, p75: 1200, p90: 1500, p95: 1700, p99: 1900, n: 40 };
const OSL = { mean: 210.5, p50: 200, p75: 250, p90: 300, p95: 350, p99: 390, n: 40 };
const KV = { mean: 0.41, p50: 0.4, p75: 0.5, p90: 0.6, p95: 0.65, p99: 0.7, n: 12 };
const PREFIX = { mean: 0.8, p50: 0.81, p75: 0.85, p90: 0.9, p95: 0.92, p99: 0.95, n: 12 };
const ISL_A = buildTokenLengthSketch([0, 10, 20, 4096, 100_000]);
const OSL_A = buildTokenLengthSketch([1, 2, 300]);
const ISL_B = buildTokenLengthSketch([7, 9_000]);

const BENCHMARK_IDS = [1, 2, 3, 4, 5, 6];

let db: PGlite;
let sql: DbClient;
let writes: unknown[][];

function profileRecord(isl: number, osl: number, latencyMs: number): string {
  return JSON.stringify({
    metadata: { conversation_id: 's1', turn_index: 0, benchmark_phase: 'profiling' },
    metrics: {
      request_latency: { value: latencyMs, unit: 'ms' },
      time_to_first_token: { value: 100, unit: 'ms' },
      input_sequence_length: { value: isl, unit: 'tokens' },
      output_sequence_length: { value: osl, unit: 'tokens' },
    },
  });
}

beforeAll(async () => {
  db = await migratedPglite();
  const base = pgliteSql(db);
  writes = [];
  sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join('').includes('update agentic_trace_replay')) {
      writes.push(values);
      return Promise.resolve([]);
    }
    return base(strings, ...values);
  };

  const stats: Record<number, unknown> = {
    1: {
      version: STATS_VERSION,
      isl: ISL,
      osl: OSL,
      kvCacheUtil: KV,
      prefixCacheHitRate: PREFIX,
      e2elPerOsl: { mean: 0.03, p50: 0.03, p75: 0.04, p90: 0.05, p95: 0.06, p99: 0.07, n: 40 },
      sequenceLengths: { isl: ISL_A, osl: OSL_A },
    },
    2: {
      version: STATS_VERSION,
      isl: ISL,
      osl: null,
      e2elPerOsl: null,
      sequenceLengths: { isl: ISL_B, osl: null },
    },
    3: { version: STATS_VERSION - 1, kvCacheUtil: KV, prefixCacheHitRate: null },
    5: {
      version: String(STATS_VERSION),
      isl: ISL,
      e2elPerOsl: { p75: 0.1, p90: 0.2 },
      sequenceLengths: { isl: ISL_A },
    },
  };
  const profile = gzipSync(
    Buffer.from([profileRecord(100, 50, 1000), profileRecord(300, 100, 3000)].join('\n')),
  );
  for (const id of [1, 2, 3, 4, 5]) {
    await base`
      insert into agentic_trace_replay (id, aggregate_stats, profile_export_jsonl_gz, server_metrics_json_gz)
      values (
        ${id},
        ${id in stats ? JSON.stringify(stats[id]) : null}::jsonb,
        ${id === 3 ? profile : null},
        ${id === 3 ? Buffer.from('not gzip') : null}
      )
    `;
  }
  const current = sequenceLengthSketchColumns(stats[1]);
  await base`
    update agentic_trace_replay
    set sequence_length_sketches = ${current.sketches},
      sequence_length_sketches_version = ${current.version}
    where id = 1
  `;
  await base`
    update agentic_trace_replay
    set sequence_length_sketches = ${encodeSequenceLengthSketches({ isl: OSL_A })},
      sequence_length_sketches_version = ${SEQUENCE_LENGTH_SKETCHES_VERSION - 100}
    where id = 2
  `;
  await db.exec('set session_replication_role = replica');
  for (const id of BENCHMARK_IDS) {
    await base`
      insert into benchmark_results
        (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics, trace_replay_id)
      values (${id}, 1, 1, 'agentic_traces', '2026-01-01', 1, 1, ${id}, '{}'::jsonb, ${id === 6 ? null : id})
    `;
  }
  await db.exec('set session_replication_role = origin');
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('aggregate_stats projections', () => {
  it('derives the fast path from the stored ratios and carries stale server fields forward', async () => {
    writes.length = 0;
    const result = await getDerivedAgenticMetrics(sql, BENCHMARK_IDS);

    expect(Object.keys(result).map(Number)).toEqual([1, 2, 3, 5]);
    expect(result[1]).toEqual({
      id: 1,
      p75_e2e_norm_intvty: 1 / 0.04,
      p90_e2e_norm_intvty: 1 / 0.05,
    });
    expect(result[2]).toEqual({ id: 2, p75_e2e_norm_intvty: null, p90_e2e_norm_intvty: null });
    expect(result[5]).toEqual({
      id: 5,
      p75_e2e_norm_intvty: 1 / 0.1,
      p90_e2e_norm_intvty: 1 / 0.2,
    });
    expect(result[3]?.p90_e2e_norm_intvty).toBeCloseTo(1 / 0.029, 6);

    expect(writes).toHaveLength(1);
    const [written, ...columns] = writes[0] as [{ kvCacheUtil: unknown }, ...unknown[]];
    expect(columns.at(-1)).toBe(3);
    expect(written.kvCacheUtil).toEqual(KV);
  });

  it('returns the stored percentile objects for current rows', async () => {
    const result = await getAgenticAggregates(sql, BENCHMARK_IDS);

    expect(result[1]).toEqual({
      id: 1,
      isl: ISL,
      osl: OSL,
      kvCacheUtil: KV,
      prefixCacheHitRate: PREFIX,
    });
    expect(result[2]).toEqual({
      id: 2,
      isl: ISL,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
    });
    expect(result[5]).toEqual({
      id: 5,
      isl: ISL,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
    });
    expect(result[3]?.isl?.n).toBe(2);
    expect(result[3]?.kvCacheUtil).toBeNull();
    expect(result[4]).toEqual({
      id: 4,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
    });
    expect(result[6]).toEqual({
      id: 6,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
    });
  });

  it('merges only sketches whose version matches exactly', async () => {
    const result = await getResidentSequenceLengthSketches(sql, BENCHMARK_IDS);

    expect(result).toEqual({
      isl: mergeTokenLengthSketches([ISL_A, ISL_B]),
      osl: mergeTokenLengthSketches([OSL_A, null]),
      coveredPoints: 2,
      requestedPoints: 6,
    });
  });
});
