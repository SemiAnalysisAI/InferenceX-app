import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql } from '../lib/test-pglite';
import {
  getAgenticCatalog,
  mergeAgenticCatalogGroups,
  type AgenticCatalogGroup,
} from './agentic-catalog';

function group(overrides: Partial<AgenticCatalogGroup>): AgenticCatalogGroup {
  return {
    id: 1,
    model: 'dsr1',
    hardware: 'b200',
    framework: 'vllm',
    precision: 'fp8',
    points: 4,
    minConc: 4,
    maxConc: 64,
    latestDate: '2026-10-01',
    tputPerGpu: 100,
    ...overrides,
  };
}

describe('mergeAgenticCatalogGroups', () => {
  it('returns one database unchanged apart from the ranking throughput', () => {
    const { tputPerGpu: _tput, ...entry } = group({});
    expect(mergeAgenticCatalogGroups([[group({})]])).toEqual([entry]);
  });

  it('adds up a group held by both databases and keeps its widest concurrency range', () => {
    const [merged] = mergeAgenticCatalogGroups([
      [group({ id: 1, points: 4, minConc: 4, maxConc: 64 })],
      [group({ id: 2, points: 3, minConc: 1, maxConc: 32 })],
    ]);
    expect(merged).toMatchObject({ points: 7, minConc: 1, maxConc: 64 });
  });

  it('picks the representative as one query would: newest, then fastest, then lowest id', () => {
    const representative = (a: Partial<AgenticCatalogGroup>, b: Partial<AgenticCatalogGroup>) =>
      mergeAgenticCatalogGroups([[group({ id: 1, ...a })], [group({ id: 2, ...b })]])[0]!.id;

    expect(representative({ latestDate: '2026-10-01' }, { latestDate: '2026-10-02' })).toBe(2);
    expect(representative({ tputPerGpu: 90 }, { tputPerGpu: 110 })).toBe(2);
    expect(representative({ tputPerGpu: null }, { tputPerGpu: 1 })).toBe(2);
    expect(representative({ tputPerGpu: 1 }, { tputPerGpu: null })).toBe(1);
    expect(representative({ id: 7 }, { id: 3 })).toBe(3);
  });

  it('keeps groups that only one database holds', () => {
    const merged = mergeAgenticCatalogGroups([
      [group({ id: 1, hardware: 'b200' })],
      [group({ id: 2, hardware: 'mi355x' })],
    ]);
    expect(merged.map((entry) => entry.hardware)).toEqual(['b200', 'mi355x']);
  });
});

function seed(id: number, conc: number, tput: string): string {
  return `
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (${id}, ${id}, 1, 'Run Sweep', '2026-10-01T00:00:00Z', '2026-10-01');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'vllm', 'fp8', 'none', false, false, 8, 8, 8, 8);
    INSERT INTO agentic_trace_replay (id, profile_export_chunk_count) VALUES (${id}, 1);
    INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics, trace_replay_id)
    VALUES (${id}, ${id}, 1, 'agentic_traces', '2026-10-01', ${conc}, '${tput}', ${id});`;
}

describe('getAgenticCatalog', () => {
  const databases: PGlite[] = [];

  beforeAll(async () => {
    databases.push(await migratedPglite(), await migratedPglite());
    await databases[0]!.exec(seed(1, 8, '{}'));
    await databases[1]!.exec(seed(1_000_000_000_000, 64, '{"tput_per_gpu": 0}'));
  }, 60_000);

  afterAll(async () => {
    await Promise.all(databases.map((db) => db.close()));
  });

  it('lists a group held by both databases once, ranking a missing throughput last', async () => {
    await expect(getAgenticCatalog(databases.map(pgliteSql))).resolves.toEqual([
      {
        id: 1_000_000_000_000,
        model: 'dsr1',
        hardware: 'b200',
        framework: 'vllm',
        precision: 'fp8',
        points: 2,
        minConc: 8,
        maxConc: 64,
        latestDate: '2026-10-01',
      },
    ]);
  });
});
