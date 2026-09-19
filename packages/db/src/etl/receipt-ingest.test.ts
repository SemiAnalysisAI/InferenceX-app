import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { sha256 } from '../lib/artifact-archive';
import type { MeasurementReceipt } from '../lib/measurement-receipt';
import { mapBenchmarkRow } from './benchmark-mapper';
import { bulkIngestBenchmarkRows } from './benchmark-ingest';
import { createSkipTracker } from './skip-tracker';
import {
  prepareReceiptIngestInputs,
  ingestReceiptEvaluations,
  assertReceiptIngestMode,
  completeReceiptIngest,
} from './receipt-ingest';
import { claimMeasurementSnapshot } from './measurement-snapshot';

type Sql = postgres.Sql;
let db: PGlite;
let sql: Sql;
const roots: string[] = [];
const fixture = new URL('../lib/fixtures/measurement-receipt/', import.meta.url);

function queryClient(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      // postgres.js supplies typed array parameters; PGlite needs their OIDs
      // for unnest calls whose SQL deliberately omits a redundant cast.
      const result = await database.query(query, values, {
        paramTypes: values.map((value) => (Array.isArray(value) ? 1009 : 0)),
      });
      return result.rows;
    },
    { json: JSON.stringify, array: (values: unknown[]) => values },
  );
}

beforeAll(async () => {
  db = await PGlite.create();
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const name of fs
    .readdirSync(migrations)
    .filter((file) => file.endsWith('.sql'))
    .toSorted())
    await db.exec(fs.readFileSync(new URL(name, migrations), 'utf8'));
  sql = Object.assign(queryClient(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(queryClient(tx) as unknown as Sql)),
  }) as unknown as Sql;
}, 20_000);

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs, measurement_snapshots RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 100, 2, 'Run Sweep', 'completed', 'success', '2026-09-19', '2026-09-19');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'h200', 'vllm', 'fp8', 'none', false, 8, 8, 8, 8);`);
});
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);
afterAll(() => db?.close());

it.each(['normalized', 'lm-eval'] as const)(
  'ingests bound benchmark data and recovers strict samples from %s receipts through replay',
  async (format) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-ingest-'));
    roots.push(root);
    fs.cpSync(fixture, root, { recursive: true });
    const receipt = JSON.parse(
      fs.readFileSync(path.join(root, 'receipt.json'), 'utf8'),
    ) as MeasurementReceipt;
    if (format === 'lm-eval') {
      const point = receipt.points[1];
      const artifact = receipt.artifacts[1];
      const directory = path.join(root, artifact.name);
      const meta = JSON.parse(fs.readFileSync(path.join(directory, 'agg.json'), 'utf8'))[0];
      fs.unlinkSync(path.join(directory, 'agg.json'));
      point.normalized_format = 'lm-eval';
      point.normalized_path = 'results_2026-09-19_conc28.json';
      point.metadata_path = 'meta_env.json';
      fs.writeFileSync(path.join(directory, point.metadata_path), JSON.stringify(meta));
      fs.writeFileSync(
        path.join(directory, point.normalized_path),
        JSON.stringify({
          results: {
            gsm8k: { 'exact_match,strict-match': 0.5, 'exact_match,flexible-extract': 1 },
          },
          'n-samples': { gsm8k: { effective: 2 } },
        }),
      );
      // The binding must work with the actual timestamp/concurrency naming shape.
      const sampleName = 'samples_gsm8k_2026-09-19_conc28.jsonl';
      fs.renameSync(path.join(directory, point.samples_path!), path.join(directory, sampleName));
      point.samples_path = sampleName;
      artifact.members = fs.readdirSync(directory).map((name) => {
        const bytes = fs.readFileSync(path.join(directory, name));
        return { path: name, size: bytes.length, sha256: sha256(bytes) };
      });
    }

    const tracker = createSkipTracker();
    const inputs = prepareReceiptIngestInputs(receipt, root, tracker);
    expect(inputs.benchmarkFiles.map((file) => path.relative(root, file))).toEqual([
      'bmk_pilot/agg.json',
    ]);
    const rows = inputs.benchmarkFiles
      .flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
      .map((row) => mapBenchmarkRow(row, tracker));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.config.numDecodeGpu).toBe(8);
    expect(Object.values(tracker.skips).every((count) => count === 0)).toBe(true);
    expect(() => assertReceiptIngestMode(inputs, true)).toThrow('evals-only');
    const unclaimed = await db.query('select count(*) as count from measurement_snapshots');
    expect(unclaimed.rows).toEqual([{ count: 0 }]);
    assertReceiptIngestMode(inputs, false);
    await claimMeasurementSnapshot(sql, receipt);
    const resolveConfig = async (config: (typeof inputs.evaluations)[0]['params']['config']) => {
      const matching = await db.query<{ id: number }>(
        'select id from configs where model=$1 and hardware=$2',
        [config.model, config.hardware],
      );
      if (matching.rows.length !== 1) throw new Error('unmapped test config');
      return matching.rows[0].id;
    };
    // Fail the real sample INSERT after the summary has committed, then resume
    // the accepted snapshot. Incomplete samples must not look like completion.
    await db.exec('ALTER TABLE eval_samples RENAME TO interrupted_eval_samples');
    try {
      await expect(
        ingestReceiptEvaluations(sql, inputs, resolveConfig, 1, '2026-09-19'),
      ).rejects.toThrow('eval_samples');
    } finally {
      await db.exec('ALTER TABLE interrupted_eval_samples RENAME TO eval_samples');
    }
    const partialResults = await db.query('select count(*) as count from eval_results');
    expect(partialResults.rows).toEqual([{ count: 1 }]);
    const partialSnapshot = await db.query('select state from measurement_snapshots');
    expect(partialSnapshot.rows).toEqual([{ state: 'writing' }]);
    expect(await ingestReceiptEvaluations(sql, inputs, resolveConfig, 1, '2026-09-19')).toEqual({
      newEvals: 0,
      newSamples: 2,
      sampleFiles: 1,
    });
    // Skipping throughput cannot refresh the curve or complete an eval-only
    // partial import. Successful replay counts existing benchmark rows too.
    await expect(completeReceiptIngest(sql, receipt, inputs, new Map())).rejects.toThrow(
      'throughput points were skipped',
    );
    const incomplete = await db.query('select state from measurement_snapshots');
    expect(incomplete.rows).toEqual([{ state: 'writing' }]);
    const benchmarkRows = rows.map((row) => ({ ...row!, configId: 1 }));
    const inserted = await bulkIngestBenchmarkRows(sql, benchmarkRows, 1, '2026-09-19');
    expect(inserted.newCount).toBe(1);
    await completeReceiptIngest(
      sql,
      receipt,
      inputs,
      new Map([[inputs.benchmarkFiles[0], inserted.insertedIds.length]]),
    );
    expect(await ingestReceiptEvaluations(sql, inputs, resolveConfig, 1, '2026-09-19')).toEqual({
      newEvals: 0,
      newSamples: 0,
      sampleFiles: 1,
    });
    const replayed = await bulkIngestBenchmarkRows(sql, benchmarkRows, 1, '2026-09-19');
    expect(replayed.newCount).toBe(0);
    expect(replayed.dupCount).toBe(1);
    await completeReceiptIngest(
      sql,
      receipt,
      inputs,
      new Map([[inputs.benchmarkFiles[0], replayed.insertedIds.length]]),
    );
    const benchmark = await db.query('select conc, metrics from latest_benchmarks');
    expect(benchmark.rows).toHaveLength(1);
    expect(benchmark.rows[0]).toMatchObject({
      conc: 1,
      metrics: { output_tput_tps: 100, duration_seconds: 60 },
    });
    const stored = await db.query(`select e.task, e.conc, s.doc_id, s.passed, s.score
      from eval_results e join eval_samples s on s.eval_result_id=e.id order by s.doc_id`);
    expect(stored.rows).toEqual([
      { task: 'gsm8k', conc: 28, doc_id: 0, passed: true, score: '1' },
      { task: 'gsm8k', conc: 28, doc_id: 1, passed: false, score: '0' },
    ]);
    const snapshot = await db.query('select state from measurement_snapshots');
    expect(snapshot.rows).toEqual([{ state: 'complete' }]);
  },
);
