import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedPglite, pgliteSql } from '../lib/test-pglite';
import { bulkIngestBenchmarkRows, type BenchmarkPersistenceInput } from './benchmark-ingest';
import { mapBenchmarkRow } from './benchmark-mapper';
import { createSkipTracker } from './skip-tracker';
import { createConfigCache } from './config-cache';
import {
  persistPreparedTraceReplay,
  prepareTraceReplay,
  reconcileHistoricalBenchmarkTrace,
  verifyHistoricalC24TraceSources,
  type PreparedTraceReplay,
} from './trace-replay-ingest';

const fixture: Record<string, unknown> = JSON.parse(
  fs.readFileSync(
    new URL('fixtures/powerx-manifest-v2/bmk_agentic_golden/agg.json', import.meta.url),
    'utf8',
  ),
);
function profile(itlMs: number) {
  return Buffer.from(
    `${JSON.stringify({
      metadata: {
        benchmark_phase: 'profiling',
        request_start_ns: 1_000_000_000,
        request_end_ns: 3_000_000_000,
      },
      metrics: {
        full_response_inter_token_latency: { value: itlMs, unit: 'ms' },
        output_sequence_length: { value: 101 },
        time_to_first_token: { value: 100, unit: 'ms' },
      },
    })}\n`,
  );
}

describe('AgentX retry persistence', () => {
  let db: PGlite;
  let winner: BenchmarkPersistenceInput;
  let prepared: PreparedTraceReplay;
  beforeAll(async () => {
    db = await migratedPglite();
    await db.exec(
      "INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date) VALUES (1, 38451594384, 3, 'retry-fixture', '2026-10-15T18:45:34Z', '2026-10-15')",
    );
    const mapped = mapBenchmarkRow(fixture, createSkipTracker());
    if (!mapped) throw new Error('Golden AgentX fixture must map');
    const { config, ...measurement } = mapped;
    winner = {
      ...measurement,
      configId: await createConfigCache(pgliteSql(db)).getOrCreateConfig(config),
      powerAudit: {
        source: 'power_validation_selected.json',
        window_start_unix: 1,
        window_end_unix: 2,
      },
      workers: [{ role: 'agg', worker_idx: 0, num_gpus: 1, avg_power_w: 500 }],
    };
    prepared = await prepareTraceReplay(profile(40), null);
  });
  beforeEach(async () => {
    await db.exec('DELETE FROM benchmark_results; DELETE FROM agentic_trace_replay;');
  });
  afterAll(async () => {
    await db.close();
  });

  async function seed(point = winner) {
    const result = await bulkIngestBenchmarkRows(pgliteSql(db), [point], 1, '2026-10-15');
    const id = result.insertedIds[0];
    if (!id) throw new Error('Seed must create a benchmark');
    return id;
  }
  async function read() {
    const result = await db.query<{
      metrics: Record<string, number>;
      trace_replay_id: number | null;
      power_audit: unknown;
      workers: unknown;
    }>('SELECT metrics, trace_replay_id, power_audit, workers FROM benchmark_results ORDER BY id');
    return result.rows[0];
  }
  async function traceIds() {
    const result = await db.query('SELECT id FROM agentic_trace_replay');
    return result.rows;
  }
  const repair = () =>
    reconcileHistoricalBenchmarkTrace(pgliteSql(db), winner, 1, (consume) => consume(prepared));

  it('preserves linked trace metrics through two ordinary re-ingests and drops unrelated stale fields', async () => {
    const id = await seed();
    await persistPreparedTraceReplay(pgliteSql(db), [id], prepared);
    await db.query('UPDATE benchmark_results SET metrics=metrics || $1::jsonb', [
      JSON.stringify({
        server_gpu_cache_hit_rate: 0.75,
        server_cpu_cache_hit_rate: 0.1,
        obsolete: 9,
        kv_cache_pool_tokens: 4096,
      }),
    ]);
    const linked = await read();
    for (let replay = 0; replay < 2; replay++) {
      await bulkIngestBenchmarkRows(pgliteSql(db), [winner], 1, '2026-10-15');
      const result = await read();
      expect(result?.trace_replay_id).toBe(linked?.trace_replay_id);
      expect(result?.metrics).toMatchObject({
        ...winner.metrics,
        ...prepared.fullResponseMetrics,
        server_gpu_cache_hit_rate: 0.75,
        server_cpu_cache_hit_rate: 0.1,
        kv_cache_pool_tokens: 4096,
      });
      expect(result?.metrics.p99_itl).toBe(0.04);
      expect(result?.metrics.p99_intvty).toBe(25);
      expect(result?.metrics.obsolete).toBeUndefined();
    }
    await db.exec('UPDATE benchmark_results SET trace_replay_id=NULL');
    await bulkIngestBenchmarkRows(pgliteSql(db), [winner], 1, '2026-10-15');
    const unlinked = await read();
    expect(unlinked?.metrics.p99_itl).toBeUndefined();
  });

  it('atomically corrects metrics and an absent trace, then reuses the same complete trace', async () => {
    await seed({
      ...winner,
      image: 'old',
      metrics: { duration_seconds: 13, obsolete: 9, p99_full_response_itl: 99 },
    });
    await repair();
    const first = await read();
    expect(first?.metrics).toEqual({ ...winner.metrics, ...prepared.fullResponseMetrics });
    expect(first?.power_audit).toEqual(winner.powerAudit);
    expect(first?.workers).toEqual(winner.workers);
    expect(first?.trace_replay_id).not.toBeNull();
    await repair();
    expect(await read()).toEqual(first);
    expect(await traceIds()).toHaveLength(1);
  });

  it('keeps fresh artifact metrics authoritative over a linked trace', async () => {
    const id = await seed();
    await persistPreparedTraceReplay(pgliteSql(db), [id], prepared);
    await db.query('UPDATE benchmark_results SET metrics=metrics || $1::jsonb', [
      JSON.stringify({ server_gpu_cache_hit_rate: 0.75, kv_cache_pool_tokens: 4096 }),
    ]);
    const fresh = {
      ...winner,
      metrics: {
        ...winner.metrics,
        median_full_response_itl: 0.2,
        median_itl: 0.2,
        median_intvty: 5,
        server_gpu_cache_hit_rate: 0.9,
      },
    };
    await bulkIngestBenchmarkRows(pgliteSql(db), [fresh], 1, '2026-10-15');
    const actual = await read();
    expect(actual?.metrics).toMatchObject({
      median_full_response_itl: 0.2,
      median_itl: 0.2,
      median_intvty: 5,
      server_gpu_cache_hit_rate: 0.9,
      p99_full_response_itl: 0.04,
      kv_cache_pool_tokens: 4096,
    });
    expect(await traceIds()).toHaveLength(1);
  });

  it('preserves measured winner full-response values when the profile also derives them', async () => {
    const measured = {
      ...winner,
      metrics: {
        ...winner.metrics,
        median_full_response_itl: 0.02,
        median_itl: 0.02,
        median_intvty: 50,
      },
    };
    const id = await seed({ ...measured, metrics: { obsolete: 9 } });
    await persistPreparedTraceReplay(pgliteSql(db), [id], prepared);
    await reconcileHistoricalBenchmarkTrace(pgliteSql(db), measured, 1, (consume) =>
      consume(prepared),
    );
    const corrected = await read();
    expect(corrected?.metrics).toEqual(measured.metrics);
    expect(await traceIds()).toHaveLength(1);
  });

  it('refuses an unknown trace and preserves both its link and metrics', async () => {
    const id = await seed({ ...winner, metrics: { duration_seconds: 13 } });
    await persistPreparedTraceReplay(
      pgliteSql(db),
      [id],
      await prepareTraceReplay(profile(80), null),
    );
    const before = await read();
    await expect(repair()).rejects.toThrow('unknown existing trace');
    expect(await read()).toEqual(before);
    expect(await traceIds()).toHaveLength(1);
  });

  it.each(['missing-profile', 'missing-csv', 'missing-json', 'changed-profile'])(
    'refuses %s source bytes before changing the historical row or trace',
    async (change) => {
      const id = await seed({ ...winner, metrics: { duration_seconds: 13 } });
      await persistPreparedTraceReplay(pgliteSql(db), [id], prepared);
      const before = await read();
      const tracesBefore = await traceIds();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-sources-'));
      try {
        const profileJsonl = path.join(dir, 'profile_export.jsonl');
        const serverMetricsCsv = path.join(dir, 'server_metrics_export.csv');
        const serverMetricsJson = path.join(dir, 'server_metrics_export.json');
        fs.writeFileSync(profileJsonl, profile(40));
        fs.writeFileSync(serverMetricsCsv, 'timestamp,value\n1,2\n');
        fs.writeFileSync(serverMetricsJson, '{}');
        await expect(
          (async () => {
            await verifyHistoricalC24TraceSources({
              profileJsonl: change === 'missing-profile' ? null : profileJsonl,
              serverMetricsCsv: change === 'missing-csv' ? null : serverMetricsCsv,
              serverMetricsJson: change === 'missing-json' ? null : serverMetricsJson,
            });
            await repair();
          })(),
        ).rejects.toThrow(
          change === 'changed-profile'
            ? 'source hash mismatch: profile_export.jsonl'
            : 'requires its winning profile JSONL, server CSV and server JSON',
        );
        expect(await read()).toEqual(before);
        expect(await traceIds()).toEqual(tracesBefore);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('requires the complete winning payload, including server metrics, for trace reuse', async () => {
    const id = await seed();
    await persistPreparedTraceReplay(
      pgliteSql(db),
      [id],
      await prepareTraceReplay(profile(40), Buffer.from('different csv')),
    );
    const before = await read();
    await expect(repair()).rejects.toThrow('unknown existing trace');
    expect(await read()).toEqual(before);
  });

  it.each(['metrics', 'trace'] as const)(
    'refuses concurrent %s changes made after the snapshot',
    async (changed) => {
      const id = await seed({ ...winner, metrics: { duration_seconds: 13 } });
      let concurrent: Awaited<ReturnType<typeof read>> | undefined;
      await expect(
        reconcileHistoricalBenchmarkTrace(pgliteSql(db), winner, 1, async (consume) => {
          await (changed === 'metrics'
            ? db.exec("UPDATE benchmark_results SET metrics='{}'::jsonb")
            : persistPreparedTraceReplay(pgliteSql(db), [id], prepared));
          concurrent = await read();
          return consume(prepared);
        }),
      ).rejects.toThrow('changed during trace preparation');
      expect(await read()).toEqual(concurrent);
      expect(await traceIds()).toHaveLength(changed === 'trace' ? 1 : 0);
    },
  );

  it('rolls back a newly stored trace if the benchmark update fails', async () => {
    await seed({ ...winner, metrics: { duration_seconds: 13 } });
    const before = await read();
    await db.exec(
      "CREATE FUNCTION reject_retry_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected update failure'; END $$; CREATE TRIGGER reject_retry_update BEFORE UPDATE ON benchmark_results FOR EACH ROW EXECUTE FUNCTION reject_retry_update();",
    );
    try {
      await expect(repair()).rejects.toThrow('injected update failure');
      expect(await read()).toEqual(before);
      expect(await traceIds()).toHaveLength(0);
    } finally {
      await db.exec(
        'DROP TRIGGER reject_retry_update ON benchmark_results; DROP FUNCTION reject_retry_update();',
      );
    }
  });
});
