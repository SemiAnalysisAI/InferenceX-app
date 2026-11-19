import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { backfillSpecAlgorithm, loadSpecAlgorithmCandidates } from './spec-algorithm-backfill';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

let db: PGlite;
let sql: PgliteSql;

async function point(
  id: number,
  {
    spec,
    log,
    file,
    metrics = {},
  }: { spec: string; log?: string; file?: string; metrics?: object },
) {
  const [config] = await sql`
    insert into configs (hardware, framework, model, precision, spec_method, disagg, is_multinode,
      prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
      decode_tp, decode_ep, decode_dp_attention, decode_num_workers, num_prefill_gpu, num_decode_gpu)
    values ('b300', 'vllm', 'kimik3', 'fp4', ${spec}, false, false, 8, 1, false, 0, 8, 1, false, 0, 8, 8)
    on conflict (hardware, framework, model, precision, spec_method, disagg, is_multinode,
      prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
      decode_tp, decode_ep, decode_dp_attention, decode_num_workers, num_prefill_gpu, num_decode_gpu)
    do update set hardware = excluded.hardware
    returning id
  `;
  await sql`insert into server_logs (id, server_log) values (${id}, ${log ?? ''})`;
  if (file) {
    await sql`insert into server_log_files (server_log_id, file_name, log_text)
      values (${id}, 'decode.log', ${file})`;
  }
  await sql`
    insert into benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics,
      server_log_id, offload_mode)
    values (${id}, 1, ${config!.id}, 'agentic_traces', '2026-08-16', ${id}, ${JSON.stringify(metrics)}::jsonb,
      ${id}, 'on')
  `;
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
  await sql`
    insert into workflow_runs (id, github_run_id, run_attempt, name, head_sha, head_branch, created_at, date)
    values (1, 31893747354, 2, 'run', 'sha', 'main', '2026-08-16T00:00:00Z', '2026-08-16')
  `;
  const drafting = `INFO [core.py:122] Initializing a V1 LLM engine with config: model='/scratch/models/Kimi-K3', speculative_config=SpeculativeConfig(method='dspark', model='/data/models/Kimi-K3-DSpark', num_spec_tokens=7), tokenizer='x'`;
  await point(1, { spec: 'mtp', file: drafting });
  await point(2, { spec: 'mtp', log: "speculative_config=None, tokenizer='x'" });
  await point(3, { spec: 'none', log: drafting });
  await point(4, { spec: 'mtp', log: drafting, metrics: { spec_algorithm: 'mtp' } });
});

afterAll(async () => {
  await db.close();
});

describe('spec algorithm backfill', () => {
  it('selects labeled-speculative AgentX points that lack the algorithm', async () => {
    expect(await loadSpecAlgorithmCandidates(sql)).toEqual([1, 2]);
  });

  it('merges what the server log says it ran and leaves non-drafting servers alone', async () => {
    expect(await backfillSpecAlgorithm(sql, 1)).toEqual({
      spec_algorithm: 'dspark',
      spec_draft_model: 'Inferact/Kimi-K3-DSpark',
    });
    expect(await backfillSpecAlgorithm(sql, 2)).toBeNull();
    const rows = await sql<{ id: number; metrics: Record<string, unknown> }[]>`
      select id, metrics from benchmark_results where id in (1, 2) order by id
    `;
    expect(rows.map((row) => row.metrics)).toEqual([
      { spec_algorithm: 'dspark', spec_draft_model: 'Inferact/Kimi-K3-DSpark' },
      {},
    ]);
    expect(await loadSpecAlgorithmCandidates(sql)).toEqual([2]);
  });
});
