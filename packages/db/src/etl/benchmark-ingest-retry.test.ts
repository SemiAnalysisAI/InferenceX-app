import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { expect, it } from 'vitest';

import { bulkIngestBenchmarkRows, type BenchmarkPersistenceInput } from './benchmark-ingest';

it('repairs retry measurements idempotently without changing linked trace metrics or IDs', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE TABLE benchmark_results (
      id serial PRIMARY KEY, workflow_run_id int, config_id int, benchmark_type text,
      offload_mode text, date date, isl int, osl int, conc int, image text,
      recipe_fingerprint text, metrics jsonb, workers jsonb,
      power_invalid_reasons jsonb, power_audit jsonb, trace_replay_id int,
      UNIQUE NULLS NOT DISTINCT (workflow_run_id, config_id, benchmark_type,
        isl, osl, conc, offload_mode, recipe_fingerprint));`);
    const sql = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
        // postgres.js supplies array parameter OIDs; PGlite's simple client needs
        // explicit types for the two text-array unnest lanes.
        const typed = query.replaceAll(
          /unnest\((?<parameter>\$\d+)\)/gu,
          'unnest($<parameter>::text[])',
        );
        const result = await db.query(typed, values);
        return result.rows;
      },
      { array: (value: unknown) => value },
    ) as unknown as postgres.Sql;
    const point: BenchmarkPersistenceInput = {
      configId: 1,
      benchmarkType: 'agentic_traces',
      isl: null,
      osl: null,
      conc: 4,
      offloadMode: 'off',
      image: 'nightly',
      recipeFingerprint: 'same-recipe',
      metrics: {
        tput_per_gpu: 405.2768,
        total_requests_completed: 112,
        server_gpu_cache_hit_rate: 0.15,
      },
    };
    await bulkIngestBenchmarkRows(sql, [point], 2554, '2026-09-23');
    await db.exec(`UPDATE benchmark_results SET trace_replay_id=2994, metrics=metrics ||
      '{"server_gpu_cache_hit_rate":0.14848932035646692,"server_cpu_cache_hit_rate":0.02,
        "kv_cache_pool_tokens":4382208,"median_full_response_itl":0.00883}'::jsonb;`);
    const repair = {
      ...point,
      metrics: {
        tput_per_gpu: 396.14743,
        total_requests_completed: 105,
        server_gpu_cache_hit_rate: 0.21678,
      },
    };
    await bulkIngestBenchmarkRows(sql, [repair], 2554, '2026-09-23');
    const read = async () => {
      const result = await db.query<{
        id: number;
        trace_replay_id: number | null;
        metrics: Record<string, number>;
      }>('SELECT * FROM benchmark_results');
      return result.rows;
    };
    const repaired = await read();
    expect(repaired).toHaveLength(1);
    expect(repaired[0]).toMatchObject({
      id: 1,
      trace_replay_id: 2994,
      metrics: {
        tput_per_gpu: 396.14743,
        total_requests_completed: 105,
        server_gpu_cache_hit_rate: 0.14848932035646692,
        server_cpu_cache_hit_rate: 0.02,
        kv_cache_pool_tokens: 4382208,
        median_full_response_itl: 0.00883,
      },
    });
    await bulkIngestBenchmarkRows(sql, [repair], 2554, '2026-09-23');
    expect(await read()).toEqual(repaired);
    // Without a linked trace, fresh artifact cache measurements stay authoritative.
    await bulkIngestBenchmarkRows(sql, [{ ...repair, conc: 8 }], 2554, '2026-09-23');
    const rows = await read();
    expect(
      rows.find((row) => row.trace_replay_id === null)?.metrics.server_gpu_cache_hit_rate,
    ).toBe(0.21678);
  } finally {
    await db.close();
  }
});
