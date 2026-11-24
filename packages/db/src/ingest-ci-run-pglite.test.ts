// Runs the real ingest-ci-run script against PGlite: createAdminSql is the only seam, and the
// GitHub run lookup is answered by a stubbed fetch. --parallel test workers isolate each file, so
// the module mock stays inside this one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test';

import { migratedPglite, pgliteDriverSql } from './lib/test-pglite';

const RUN_ID = 99999999001;
const RUN_ATTEMPT = 2;
const TRACE_SUFFIX = 'dsr1_fp8_vllm_tp8_h200';

let db: PGlite;
let dir: string;
let endDriver: (() => Promise<void>) | undefined;
let receipt: unknown;
let report: Record<string, any>;
let exitCode: typeof process.exitCode;

function writeJson(relative: string, value: unknown): void {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

const benchmarkRow = (conc: number, tput: number) => ({
  infmax_model_prefix: 'dsr1',
  hw: 'h200-nv',
  framework: 'vllm',
  precision: 'fp8',
  isl: 1024,
  osl: 1024,
  conc,
  tp: 8,
  ep: 1,
  dp_attention: false,
  tput_per_gpu: tput,
  median_ttft: 0.05,
  mean_tpot: 0.012,
});

beforeAll(async () => {
  db = await migratedPglite();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-ci-run-pglite-'));
  writeJson('bmk_dsr1_1k1k_fp8_vllm_tp8-ep1-dpafalse_conc4-8_h200/results.json', [
    benchmarkRow(4, 1000),
    benchmarkRow(8, 1800),
  ]);
  // One agentic point whose trace replay has a truncated server metrics export: the point and its
  // trace are written, and the empty server-derived stats surface as a receipt warning.
  writeJson(`bmk_agentic_${TRACE_SUFFIX}/results.json`, [
    {
      infmax_model_prefix: 'dsr1',
      hw: 'h200-nv',
      framework: 'vllm',
      precision: 'fp8',
      scenario_type: 'agentic-coding',
      users: 16,
      tp: 8,
      ep: 1,
      tput_per_gpu: 500,
    },
  ]);
  const traceDir = path.join(dir, `agentic_${TRACE_SUFFIX}`, 'trace_replay');
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(
    path.join(traceDir, 'profile_export.jsonl'),
    [1, 2]
      .map((turn) =>
        JSON.stringify({
          metadata: { benchmark_phase: 'profiling', conversation_id: 'c', turn_index: turn },
          metrics: {
            input_sequence_length: { value: 1000 * turn },
            output_sequence_length: { value: 100 },
            request_latency: { value: 2000 },
            time_to_first_token: { value: 200 },
          },
        }),
      )
      .join('\n'),
  );
  fs.writeFileSync(path.join(traceDir, 'server_metrics_export.json'), '{"metrics": {"vllm:');
  writeJson('run-stats/run_stats.json', { h200: { n_success: 2, total: 3 } });
  writeJson('eval_results_all/agg.json', [
    {
      infmax_model_prefix: 'dsr1',
      hw: 'h200-nv',
      framework: 'vllm',
      precision: 'fp8',
      tp: 8,
      ep: 1,
      task: 'gsm8k',
      em_strict: 0.85,
      n_eff: 1000,
      source: 'eval_dsr1_1k1k_12345678.zip',
    },
  ]);
  writeJson('changelog-metadata/changelog_metadata.json', {
    base_ref: 'base-sha',
    head_ref: 'head-sha',
    entries: [
      {
        'config-keys': ['dsr1-fp8-h200-vllm'],
        description: 'Add dsr1 h200 vllm',
        'pr-link': 'https://github.com/SemiAnalysisAI/InferenceX/pull/1',
      },
    ],
  });

  const sql = await pgliteDriverSql(db);
  // The script ends its client when done. Keep the real end, which also stops the socket server.
  endDriver = sql.end;
  const { promise: ended, resolve: end } = Promise.withResolvers<void>();
  mock.module('./etl/db-utils', () => ({
    createAdminSql: () => Object.assign(sql, { end: () => Promise.resolve(end()) }),
  }));
  spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL | Request) => {
    const url = String(input);
    if (!url.endsWith(`/actions/runs/${RUN_ID}`)) {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    const run = {
      name: 'Run Sweep',
      status: 'completed',
      conclusion: 'success',
      html_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`,
      created_at: '2026-09-05T12:00:00Z',
      run_started_at: '2026-09-05T12:01:00Z',
      head_sha: 'f'.repeat(40),
      head_branch: 'main',
      run_attempt: RUN_ATTEMPT,
      head_commit: { message: 'Add dsr1 h200 vllm' },
      pull_requests: [],
      repository: { html_url: 'https://github.com/SemiAnalysisAI/InferenceX' },
    };
    return Promise.resolve(Response.json(run));
  }) as typeof fetch);
  for (const method of ['log', 'warn', 'error'] as const) {
    spyOn(console, method).mockImplementation(() => {});
  }

  const receiptPath = path.join(dir, 'database-writes.json');
  const reportPath = path.join(dir, 'ingest-report.json');
  Object.assign(process.env, {
    DATABASE_WRITE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
    GITHUB_TOKEN: 'unused',
    INGEST_RUN_ID: String(RUN_ID),
    INGEST_RUN_ATTEMPT: String(RUN_ATTEMPT),
    INGEST_ARTIFACTS_PATH: dir,
    INGEST_REPO: 'SemiAnalysisAI/InferenceX',
    INGEST_TRACE_WORKERS: '1',
    DATABASE_WRITE_RECEIPT: receiptPath,
    INGEST_REPORT_OUTPUT: reportPath,
  });
  // A static import would run the script before the env, mock and stub above exist.
  await import('./ingest-ci-run');
  await ended;
  exitCode = process.exitCode;
  process.exitCode = undefined;
  receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}, 60_000);

afterAll(async () => {
  await endDriver?.();
  await db?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function rows(query: string): Promise<Record<string, unknown>[]> {
  const result = await db.query<Record<string, unknown>>(query);
  return result.rows;
}

describe('ingest-ci-run writes a tiny bundle to the database', () => {
  it('succeeds, and its receipt lists only the unreadable server metrics as a warning', () => {
    expect(exitCode).toBeUndefined();
    expect(receipt).toEqual({
      version: 1,
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      errors: [],
      warnings: [
        {
          kind: 'trace_replay',
          subject: TRACE_SUFFIX,
          message: expect.stringMatching(
            /^server metrics unreadable \(.+\), so the chart series and KV cache and prefix cache stats are empty$/u,
          ),
        },
      ],
    });
    expect(report).toMatchObject({
      runId: RUN_ID,
      runAttempt: RUN_ATTEMPT,
      status: 'succeeded',
      counts: {
        benchmark: { new: 3, duplicate: 0, skipped: 0, unmapped: 0, failed: 0 },
        eval: { new: 1, duplicate: 0, failed: 0 },
        trace: { new: 1, duplicate: 0, skipped: 0, failed: 0 },
      },
    });
  });

  it('links the trace with profile stats and leaves the server-derived stats empty', async () => {
    expect(
      await rows(
        `SELECT br.conc, atr.aggregate_stats->'isl'->>'n' AS isl_n,
                atr.aggregate_stats->'kvCacheUtil' AS kv, atr.chart_series
         FROM benchmark_results br JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id`,
      ),
    ).toEqual([{ conc: 16, isl_n: '2', kv: null, chart_series: null }]);
  });

  it('writes the workflow run from the GitHub run', async () => {
    expect(
      await rows(
        `SELECT github_run_id::text, run_attempt, name, date::text, head_branch, conclusion, append_only
         FROM workflow_runs`,
      ),
    ).toEqual([
      {
        github_run_id: String(RUN_ID),
        run_attempt: RUN_ATTEMPT,
        name: 'Run Sweep',
        date: '2026-09-05',
        head_branch: 'main',
        conclusion: 'success',
        append_only: false,
      },
    ]);
  });

  it('writes one config and every benchmark point under it', async () => {
    expect(
      await rows(
        `SELECT hardware, framework, model, precision, spec_method, decode_tp FROM configs`,
      ),
    ).toEqual([
      {
        hardware: 'h200',
        framework: 'vllm',
        model: 'dsr1',
        precision: 'fp8',
        spec_method: 'none',
        decode_tp: 8,
      },
    ]);
    expect(
      await rows(
        `SELECT br.benchmark_type, br.isl, br.osl, br.conc, br.date::text,
                (br.metrics->>'tput_per_gpu')::float AS tput, br.error
         FROM benchmark_results br JOIN workflow_runs wr ON wr.id = br.workflow_run_id
         ORDER BY br.conc`,
      ),
    ).toEqual([
      {
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        conc: 4,
        date: '2026-09-05',
        tput: 1000,
        error: null,
      },
      {
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        conc: 8,
        date: '2026-09-05',
        tput: 1800,
        error: null,
      },
      {
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        conc: 16,
        date: '2026-09-05',
        tput: 500,
        error: null,
      },
    ]);
  });

  it('writes availability, run stats, the eval and the changelog', async () => {
    expect(
      await rows(
        `SELECT model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type,
                date::text FROM availability ORDER BY benchmark_type`,
      ),
    ).toEqual(
      [
        { isl: null, osl: null, benchmark_type: 'agentic_traces' },
        { isl: 1024, osl: 1024, benchmark_type: 'single_turn' },
      ].map((key) => ({
        model: 'dsr1',
        precision: 'fp8',
        hardware: 'h200',
        framework: 'vllm',
        spec_method: 'none',
        disagg: false,
        date: '2026-09-05',
        ...key,
      })),
    );
    expect(await rows(`SELECT hardware, n_success, total FROM run_stats`)).toEqual([
      { hardware: 'h200', n_success: 2, total: 3 },
    ]);
    expect(
      await rows(`SELECT task, isl, osl, (metrics->>'em_strict')::float AS em FROM eval_results`),
    ).toEqual([{ task: 'gsm8k', isl: 1024, osl: 1024, em: 0.85 }]);
    expect(
      await rows(
        `SELECT base_ref, head_ref, config_keys, description, pr_link FROM changelog_entries`,
      ),
    ).toEqual([
      {
        base_ref: 'base-sha',
        head_ref: 'head-sha',
        config_keys: ['dsr1-fp8-h200-vllm'],
        description: 'Add dsr1 h200 vllm',
        pr_link: 'https://github.com/SemiAnalysisAI/InferenceX/pull/1',
      },
    ]);
  });
});
