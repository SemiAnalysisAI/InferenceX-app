import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DOWNSTREAM_ID_START } from '../lib/downstream-ids';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import {
  getLatestBenchmarksAcross,
  mergeBenchmarkHistory,
  mergeEvalResults,
  mergeSubmissionSummaries,
  mergeWorkflowRuns,
} from './across-dbs';
import { getAllBenchmarksForHistory, getLatestBenchmarks } from './benchmarks';
import type { EvalRow } from './evaluations';
import type { SubmissionSummaryRow } from './submissions';
import type { WorkflowRunRow } from './workflow-info';

const OWN = DOWNSTREAM_ID_START;
const MODEL = 'glm5.2';

const CONFIGS = {
  shared: `('${MODEL}', 'gb300', 'dynamo-trt', 'fp4', 'none', false, 8, 8, 8, 8)`,
  publicOnly: `('${MODEL}', 'b200', 'sglang', 'fp8', 'none', false, 8, 8, 8, 8)`,
  ownOnly: `('${MODEL}', 'mi455x', 'vllm', 'fp4', 'none', false, 8, 8, 8, 8)`,
};

interface Run {
  id: number;
  githubId: number;
  started: string;
  points: [id: number, config: keyof typeof CONFIGS, conc: number][];
}

// Same day: public 111 at 12:00, downstream 222 at 14:00, public 333 at 16:00.
const PUBLIC_RUNS: Run[] = [
  {
    id: 11,
    githubId: 111,
    started: '12:00',
    points: [
      [1, 'shared', 8],
      [2, 'shared', 16],
      [3, 'publicOnly', 8],
    ],
  },
  { id: 12, githubId: 333, started: '16:00', points: [[4, 'publicOnly', 8]] },
];
const OWN_RUNS: Run[] = [
  {
    id: OWN,
    githubId: 222,
    started: '14:00',
    points: [
      [OWN, 'shared', 8],
      [OWN + 1, 'shared', 32],
      [OWN + 2, 'ownOnly', 8],
    ],
  },
];

async function load(db: PGlite, runs: Run[]): Promise<void> {
  const configs = [...new Set(runs.flatMap((run) => run.points.map(([, config]) => config)))];
  for (const config of configs) {
    await db.exec(`INSERT INTO configs (model, hardware, framework, precision, spec_method,
      disagg, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu) VALUES ${CONFIGS[config]}`);
  }
  for (const run of runs) {
    await db.exec(`INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status,
      conclusion, created_at, run_started_at, date, html_url)
      VALUES (${run.id}, ${run.githubId}, 1, 'Run Sweep', 'completed', 'success',
        '2026-09-11T${run.started}:00Z', '2026-09-11T${run.started}:00Z', '2026-09-11',
        'https://github.com/o/r/actions/runs/${run.githubId}')`);
    for (const [id, config, conc] of run.points) {
      const [model, hardware, framework] = CONFIGS[config]
        .slice(1)
        .split(', ')
        .map((v) => v.replaceAll("'", ''));
      await db.exec(`INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type,
        date, conc, offload_mode, image, metrics)
        SELECT ${id}, ${run.id}, c.id, 'agentic_traces', '2026-09-11', ${conc}, 'off', 'img', '{}'
        FROM configs c WHERE c.model = '${model}' AND c.hardware = '${hardware}'
          AND c.framework = '${framework}'`);
    }
  }
}

function ids(rows: { id: number }[]): number[] {
  return rows.map((row) => Number(row.id)).toSorted((a, b) => a - b);
}

describe('getLatestBenchmarksAcross', () => {
  const dbs: PGlite[] = [];
  let combined: PgliteSql;
  let split: PgliteSql[];

  beforeAll(async () => {
    dbs.push(await migratedPglite(), await migratedPglite(), await migratedPglite());
    await load(dbs[0]!, [...PUBLIC_RUNS, ...OWN_RUNS]);
    await load(dbs[1]!, PUBLIC_RUNS);
    await load(dbs[2]!, OWN_RUNS);
    combined = pgliteSql(dbs[0]!);
    split = [pgliteSql(dbs[1]!), pgliteSql(dbs[2]!)];
  }, 60_000);

  afterAll(async () => {
    await Promise.all(dbs.map((db) => db.close()));
  });

  it.each([
    ['current', undefined, undefined, undefined],
    ['dated', '2026-09-11', undefined, undefined],
    ['exact date', '2026-09-11', true, undefined],
    ['as of the earliest public run', '2026-09-11', false, '111'],
    ['as of the downstream run', '2026-09-11', false, '222'],
  ] as const)(
    'answers %s like one database holding every run',
    async (_case, date, exact, asOf) => {
      const expected = ids(await getLatestBenchmarks(combined, MODEL, date, exact, asOf));
      expect(ids(await getLatestBenchmarksAcross(split, MODEL, date, exact, asOf))).toEqual(
        expected,
      );
    },
  );

  it('takes each curve from the newer run, whichever database holds it', async () => {
    expect(ids(await getLatestBenchmarksAcross(split, MODEL))).toEqual([4, OWN, OWN + 1, OWN + 2]);
    expect(ids(await getLatestBenchmarksAcross(split, MODEL, '2026-09-11', false, '111'))).toEqual([
      1, 2, 3,
    ]);
  });

  it('lists every snapshot of both databases in history', async () => {
    const expected = ids(
      await getAllBenchmarksForHistory(combined, MODEL, null, null, 'agentic_traces'),
    );
    const parts = await Promise.all(
      split.map((sql) => getAllBenchmarksForHistory(sql, MODEL, null, null, 'agentic_traces')),
    );
    expect(ids(mergeBenchmarkHistory(parts))).toEqual(expected);
  });
});

function evalRow(overrides: Partial<EvalRow>): EvalRow {
  return {
    id: 1,
    config_id: 1,
    hardware: 'b200',
    framework: 'vllm',
    model: MODEL,
    precision: 'fp8',
    spec_method: 'none',
    spec_algorithm: null,
    spec_draft_model: null,
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    task: 'gsm8k',
    date: '2026-09-11',
    conc: 8,
    metrics: {},
    timestamp: '2026-09-11T00:00:00Z',
    run_url: null,
    ...overrides,
  };
}

describe('mergeEvalResults', () => {
  it('gives a downstream row the public id of its config, or one no public config has', () => {
    const merged = mergeEvalResults([
      [evalRow({ id: 1, config_id: 7 }), evalRow({ id: 2, config_id: 5, hardware: 'h100' })],
      [
        evalRow({ id: OWN, config_id: 5 }),
        evalRow({ id: OWN + 1, config_id: 7, hardware: 'mi455x' }),
      ],
    ]);
    const configOf = Object.fromEntries(merged.map((row) => [row.id, row.config_id]));
    expect(configOf[OWN]).toBe(7);
    expect(configOf[OWN + 1]).not.toBe(5);
    expect(configOf[OWN + 1]).not.toBe(7);
  });

  it('orders rows newest first, then by hardware', () => {
    const merged = mergeEvalResults([
      [evalRow({ id: 1, date: '2026-09-10', hardware: 'b200' })],
      [
        evalRow({ id: OWN, date: '2026-09-11', hardware: 'mi455x' }),
        evalRow({ id: OWN + 1, date: '2026-09-10', hardware: 'a100' }),
      ],
    ]);
    expect(merged.map((row) => row.id)).toEqual([OWN, OWN + 1, 1]);
  });
});

describe('mergeSubmissionSummaries', () => {
  const summary = (overrides: Partial<SubmissionSummaryRow>): SubmissionSummaryRow => ({
    model: MODEL,
    hardware: 'b200',
    framework: 'vllm',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    prefill_tp: 8,
    prefill_ep: 1,
    decode_tp: 8,
    decode_ep: 1,
    date: '2026-09-11',
    total_datapoints: 10,
    distinct_sequences: 2,
    distinct_concurrencies: 3,
    max_concurrency: 64,
    image: null,
    ...overrides,
  });

  it('adds up a config both databases submitted on one date and keeps others apart', () => {
    const merged = mergeSubmissionSummaries([
      [summary({ total_datapoints: 10, max_concurrency: 64 })],
      [
        summary({ total_datapoints: 4, max_concurrency: 128, image: 'img' }),
        summary({ hardware: 'mi455x', total_datapoints: 1 }),
      ],
    ]);
    expect(merged).toEqual([
      summary({ total_datapoints: 14, max_concurrency: 128, image: 'img' }),
      summary({ hardware: 'mi455x', total_datapoints: 1 }),
    ]);
  });
});

function workflowRun(githubId: number, createdAt: string, attempt = 1): WorkflowRunRow {
  return {
    github_run_id: githubId,
    name: 'Run Sweep',
    conclusion: 'success',
    run_attempt: attempt,
    html_url: null,
    created_at: createdAt,
    date: '2026-09-11',
  };
}

describe('mergeWorkflowRuns', () => {
  it('lists a run attempt held by both databases once, in creation order', () => {
    expect(
      mergeWorkflowRuns([
        [workflowRun(1, '2026-09-11T12:00:00Z'), workflowRun(3, '2026-09-11T16:00:00Z')],
        [
          workflowRun(2, '2026-09-11T14:00:00Z'),
          workflowRun(3, '2026-09-11T16:00:00Z'),
          workflowRun(3, '2026-09-11T17:00:00Z', 2),
        ],
      ]).map((row) => `${row.github_run_id}#${row.run_attempt}`),
    ).toEqual(['1#1', '2#1', '3#1', '3#2']);
  });
});
