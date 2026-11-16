/**
 * The fixed-sequence request-records path, end to end on the app side:
 * artifact reader and official mapper, benchmark row and request-records
 * writers, the stored-data read, the adapter and evaluator, and the page model
 * and public view, all against a local in-process Postgres with the real
 * migrations.
 *
 * Input is SYNTHETIC TEST DATA from the benchmark repository's
 * `synthetic_point.py`: the real client measured a scripted local server and
 * the real aggregation wrote the rows. Every expectation below is derived
 * from the manifest of scripted replies, not from the measured output.
 *
 * - The normal unit run uses the committed output of one such run.
 * - `bun run test:sla-roundtrip` (with `INFERENCEX_CHECKOUT` set) runs the
 *   producer afresh first, runs the same assertions on the fresh output, and
 *   fails when the fresh output and the committed one differ in shape.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  minimumSampleSize,
  reconcileSlaAccounting,
  SLA_EXAMPLE_TARGETS,
  type SlaTargets,
} from '@semianalysisai/inferencex-constants';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';
import {
  slaAttemptsFromRequestRecords,
  type SlaAttemptsBlob,
} from '@semianalysisai/inferencex-db/etl/sla-attempts';
import { migratedPglite, pgliteSql } from '@semianalysisai/inferencex-db/lib/test-pglite';
import {
  copySyntheticResults,
  GOLDEN_SYNTHETIC_POINT_DIR,
  ingestSyntheticResults,
  readSyntheticManifest,
  readSyntheticRow,
  SYNTHETIC_GITHUB_RUN_ID,
  syntheticPointShape,
  type SyntheticAttempt,
  type SyntheticIngest,
  type SyntheticManifest,
  type SyntheticPoint,
} from '@semianalysisai/inferencex-db/lib/test-synthetic-point';
import { getBenchmarksForRun } from '@semianalysisai/inferencex-db/queries/benchmarks';
import {
  getRequestRecordsPresence,
  getSlaAttempts,
  getSlaAttemptsSources,
} from '@semianalysisai/inferencex-db/queries/sla-targets';

import { buildSlaConfigs, type SlaTargetsDataset } from './dataset';
import type { SlaPointEvaluation } from './evaluation';
import { buildSlaPublicView, type SlaPublicConfig, type SlaPublicView } from './public-view';
import { evaluateStoredSlaPoints } from './stored';
import { slaEvaluationIds } from './view';

const LIVE = process.env.SLA_ROUNDTRIP === '1';
/** A registered identity, so the official mapper accepts the rows. The model and image stay synthetic. */
const IDENTITY_FLAGS = [
  '--hw',
  'h100',
  '--framework',
  'vllm',
  '--precision',
  'fp8',
  '--model-prefix',
  'dsr1',
];
const DB_MODEL = 'dsr1';
/** Label, in this test only, for an attempt the client called completed without any completion evidence. */
const UNCONFIRMED = 'completed_without_evidence';

/**
 * Scripted latencies fall into two groups: fast replies (30 ms to the first
 * token, 10 ms per token) and slow ones (250 ms, 50 ms). These targets sit
 * between the two, so which attempts pass follows from the script alone.
 */
const TARGETS: SlaTargets = {
  maxTtftMs: 140,
  maxTpotMs: 30,
  maxE2eS: null,
  requiredAttainment: 0.9,
};

/** Whether a scripted attempt passes the targets, from the manifest alone. */
function passes(attempt: SyntheticAttempt, completionMask: number): boolean {
  return (
    attempt.outcome === 'completed' &&
    (attempt.completion_evidence & completionMask) !== 0 &&
    attempt.ttft_ms !== null &&
    attempt.ttft_ms <= TARGETS.maxTtftMs &&
    (attempt.tpot_ms === null || attempt.tpot_ms <= TARGETS.maxTpotMs)
  );
}

function produce(checkout: string): string {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sla-roundtrip-')), 'out');
  execFileSync(
    'uv',
    [
      'run',
      '--project',
      'inferencex-e2e',
      '--locked',
      '--group',
      'test',
      'python',
      'inferencex-e2e/infx/tests/bench_serving/synthetic_point.py',
      '--out',
      out,
      ...IDENTITY_FLAGS,
    ],
    { cwd: checkout, stdio: ['ignore', 'inherit', 'inherit'], timeout: 600_000 },
  );
  return out;
}

interface Loaded {
  db: Awaited<ReturnType<typeof migratedPglite>>;
  sql: ReturnType<typeof pgliteSql>;
  manifest: SyntheticManifest;
  ingest: SyntheticIngest;
  view: SlaPublicView;
  config: SlaPublicConfig;
}

async function load(dir: string, targets: SlaTargets = TARGETS): Promise<Loaded> {
  const db = await migratedPglite();
  const sql = pgliteSql(db);
  const ingest = await ingestSyntheticResults(sql, dir);
  // The reads the page and the view API make, on this database.
  const rows = await getBenchmarksForRun(sql, DB_MODEL, SYNTHETIC_GITHUB_RUN_ID);
  const records = new Set(
    await getRequestRecordsPresence(
      sql,
      rows.map((row) => Number(row.id)),
    ),
  );
  const dataset: SlaTargetsDataset = {
    model: 'DeepSeek-R1-0528',
    models: ['DeepSeek-R1-0528'],
    snapshot: { kind: 'live' },
    configs: buildSlaConfigs(rows, (id, agentic) => !agentic && records.has(id)),
  };
  const [workload] = dataset.configs.map((config) => config.workload);
  const evaluations = await evaluateStoredSlaPoints(
    sql,
    slaEvaluationIds(dataset.configs),
    targets,
  );
  const view = buildSlaPublicView(dataset, workload, evaluations, targets, 'hyperscaler');
  return { db, sql, manifest: readSyntheticManifest(dir), ingest, view, config: view.configs[0] };
}

function pointOf(manifest: SyntheticManifest, conc: number): SyntheticPoint {
  const point = manifest.points.find((entry) => entry.conc === conc);
  if (!point) throw new Error(`the synthetic directory has no point at concurrency ${conc}`);
  return point;
}

function describePath(label: string, directory: () => string): void {
  describe(`request-records path: ${label}`, () => {
    let dir: string;
    let loaded: Loaded;
    let manifest: SyntheticManifest;

    beforeAll(async () => {
      dir = directory();
      loaded = await load(dir);
      manifest = loaded.manifest;
    }, 120_000);

    afterAll(async () => {
      await loaded?.db.close();
    });

    async function storedBlob(conc: number): Promise<SlaAttemptsBlob> {
      const id = loaded.ingest.idByConc.get(conc)!;
      const sources = await getSlaAttemptsSources(loaded.sql, [id]);
      expect(sources[id].kind).toBe('request_records');
      const blob = await getSlaAttempts(loaded.sql, id, sources[id].kind);
      if (!blob) throw new Error(`no stored attempt data at concurrency ${conc}`);
      return blob;
    }

    async function withChange(
      change: (block: Record<string, unknown>) => void,
      run: (changed: Loaded) => Promise<void> | void,
    ): Promise<void> {
      const target = fs.mkdtempSync(path.join(os.tmpdir(), 'sla-changed-'));
      copySyntheticResults(dir, target, (row, point) => {
        if (point.conc === 1) change(row.request_records as Record<string, unknown>);
      });
      const changed = await load(target);
      try {
        await run(changed);
      } finally {
        await changed.db.close();
        fs.rmSync(target, { recursive: true, force: true });
      }
    }

    it('is marked synthetic and names the commit that produced it', () => {
      expect(manifest.synthetic).toBe(true);
      expect(manifest.description).toMatch(/not benchmark results/u);
      expect(manifest.inferencex_commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(String(manifest.identity.model)).toContain('synthetic');
    });

    it('maps every uploaded row with the official mapper and preserves the block', () => {
      const uploaded = manifest.points.filter((point) => point.uploaded_as_bmk !== null);
      expect(uploaded.length).toBeGreaterThanOrEqual(3);
      expect(loaded.ingest.mapped).toHaveLength(uploaded.length);
      expect(loaded.ingest.tracker.skips.unmappedModel).toBe(0);
      for (const point of uploaded) {
        const raw = readSyntheticRow(dir, point.uploaded_as_bmk!);
        const mapped = loaded.ingest.mapped.find((row) => row.conc === point.conc)!;
        expect(mapped.benchmarkType).toBe('single_turn');
        expect(mapped.requestRecords).toEqual(raw.request_records);
        for (const key of ['request_records', 'duration', 'completed', 'request_throughput']) {
          expect(mapped.metrics).not.toHaveProperty(key);
          expect(loaded.ingest.tracker.unexpectedMetrics.has(key)).toBe(false);
        }
      }
    });

    it('carries counts, classes, duration, schema version and completeness into storage', async () => {
      for (const point of manifest.points) {
        if (point.uploaded_as_bmk === null || point.expected.columns_omitted) continue;
        const { counts } = point.expected;
        const raw = readSyntheticRow(dir, point.uploaded_as_bmk) as {
          duration: number;
          request_records: { window: { duration: number; duration_source: string } };
        };
        const blob = await storedBlob(point.conc);
        const statement = blob.source.requestRecords!;
        expect(statement.schemaVersion).toBe(manifest.request_records_schema_version);
        expect(statement.accounting).toEqual({
          stated: true,
          complete: point.expected.accounting_complete,
          reasons: [],
        });
        expect(statement.counts).toMatchObject({
          requested: counts.requested,
          dispatched: counts.dispatched,
          completed: counts.completed,
          failed: counts.failed,
          httpStatus: counts.http_status,
        });
        // The manifest lists only the classes that occurred; the client lists all six.
        expect(
          Object.fromEntries(
            Object.entries(statement.counts.failedByClass).filter(([, count]) => count > 0),
          ),
        ).toEqual(counts.failed_by_class);
        expect(statement.durationSource).toBe(raw.request_records.window.duration_source);
        expect(statement.durationSource).toBe('client_perf_counter_first_dispatch_to_last_return');

        const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
        expect(accounting.window.durationSource).toBe('client_reported');
        expect(accounting.window.durationS).toBe(raw.request_records.window.duration);
        expect(accounting.window.durationS).toBe(raw.duration);
        expect(accounting.window.durationS).toBeGreaterThanOrEqual(point.expected.duration_s.min);
        expect(accounting.window.durationS).toBeLessThanOrEqual(point.expected.duration_s.max);
        expect(accounting.warmupExcluded).toBe(counts.warmup_excluded);
        expect(accounting).toMatchObject({
          issued: counts.requested,
          dispatched: counts.dispatched,
          attempted: counts.dispatched,
          unknown: 0,
          incomplete: 0,
          completeness: 'complete',
          reason: 'reconciled',
        });
      }
    });

    it('keeps the explicit outcome class of every attempt', async () => {
      const bits = { done: 1, finish_reason: 2 };
      for (const point of manifest.points) {
        if (point.uploaded_as_bmk === null || point.expected.columns_omitted) continue;
        const raw = readSyntheticRow(dir, point.uploaded_as_bmk) as {
          request_records: { completion_evidence_bits: Record<string, number> };
        };
        expect(raw.request_records.completion_evidence_bits).toMatchObject(bits);
        const mask = bits.done | bits.finish_reason;
        const { attempts } = point.expected;
        const blob = await storedBlob(point.conc);

        // Every scripted attempt is in the stored data: once, under one class.
        const expected = new Map<string, number>();
        const add = (name: string) => expected.set(name, (expected.get(name) ?? 0) + 1);
        const statuses = Object.entries(point.expected.counts.http_status);
        for (const attempt of attempts) {
          if (attempt.outcome === 'http_status') continue;
          if (attempt.outcome !== 'completed') add(attempt.outcome);
          else if ((attempt.completion_evidence & mask) === 0) add(UNCONFIRMED);
          else add('completed');
        }
        for (const [code, count] of statuses) expected.set(`http_${code}`, count);
        const actual = new Map<string, number>(
          blob.set.other.map((entry) => [entry.failureClass ?? entry.outcome, entry.count]),
        );
        // Completions without completion evidence are stored apart, with their latencies.
        if (blob.set.unconfirmed) {
          actual.set(UNCONFIRMED, blob.set.unconfirmed.ttftUs.length);
        }
        if (blob.set.completed.ttftUs.length > 0) {
          actual.set('completed', blob.set.completed.ttftUs.length);
        }
        expect(Object.fromEntries(actual)).toEqual(Object.fromEntries(expected));
        expect([...actual.values()].reduce((sum, count) => sum + count, 0)).toBe(point.num_prompts);
        expect(blob.set.other.every((entry) => entry.outcome === 'failed')).toBe(true);

        // Measured first-token times sit where the script put them.
        const scripted = attempts
          .filter(
            (attempt) =>
              attempt.outcome === 'completed' && (attempt.completion_evidence & mask) !== 0,
          )
          .map((attempt) => attempt.ttft_ms!)
          .toSorted((a, b) => a - b);
        const measured = blob.set.completed.ttftUs.map((value) => value / 1000);
        expect(measured).toHaveLength(scripted.length);
        for (let index = 0; index < measured.length; index += 1) {
          const value = measured[index];
          expect(value).toBeGreaterThanOrEqual(scripted[index] - manifest.tolerance_ms.below);
          expect(value).toBeLessThanOrEqual(scripted[index] + manifest.tolerance_ms.above);
        }
      }
    });

    it('evaluates attainment, goodput and qualification from the scripted latencies', () => {
      expect(loaded.config.loadKind).toBe('request_concurrency');
      expect(loaded.view.sequences).toEqual([loaded.config.workload]);
      const mask = 3;

      // Concurrency 1: 100 attempts, five failed, one ended without completion evidence.
      const mixed = pointOf(manifest, 1);
      const expectedPassing = mixed.expected.attempts.filter((attempt) =>
        passes(attempt, mask),
      ).length;
      expect(expectedPassing).toBe(94);
      const point = loaded.config.points.find((entry) => entry.load === 1)!;
      expect(point.source?.kind).toBe('request_records');
      expect(point.counts).toMatchObject({ passing: 94, notPassing: 6, indeterminate: 0 });
      expect(point.observed).toMatchObject({
        attempted: 100,
        passing: 94,
        attainment: 0.94,
        durationSource: 'client_reported',
      });
      expect(point.observed!.goodputRps).toBeCloseTo(94 / point.observed!.durationS, 9);
      // The truncated stream is neither a completion nor a recorded failure: it
      // is its own count, in the denominator, and it does not pass.
      expect(point.accounting).toMatchObject({
        attempted: 100,
        completed: 94,
        failed: 5,
        unconfirmedCompletions: 1,
        completeness: 'complete',
        reason: 'reconciled',
      });
      expect(point.accounting!.failureClasses).toEqual({
        connection: 1,
        empty_response: 1,
        http_429: 1,
        http_503: 1,
        stream_error: 1,
      });
      // 100 attempts is the minimum sample at 90%, and 94 of 100 meets it.
      expect(minimumSampleSize(0.9)).toBe(100);
      expect(point.qualification).toMatchObject({ status: 'meets', reason: 'attainment_met' });
      expect(loaded.config.status).toBe('meets');
      expect(loaded.config.selections.highestPassingLoad).toBe(loaded.config.points.indexOf(point));

      // Concurrency 2: half the attempts are slow, and 20 attempts are too few for a verdict.
      const paired = pointOf(manifest, 2);
      const passing = paired.expected.attempts.filter((attempt) => passes(attempt, mask)).length;
      expect(passing).toBe(10);
      const small = loaded.config.points.find((entry) => entry.load === 2)!;
      expect(small.observed).toMatchObject({ attempted: 20, passing: 10, attainment: 0.5 });
      expect(small.qualification).toMatchObject({
        status: 'insufficient_data',
        reason: 'below_minimum_sample',
        exploratory: false,
      });
    });

    it('never passes an attempt that streamed a token and then failed', async () => {
      const point = pointOf(manifest, 1);
      const raw = readSyntheticRow(dir, point.uploaded_as_bmk!) as {
        request_records: { outcomes: string[]; columns: Record<string, (number | null)[]> };
      };
      const { outcomes, columns } = raw.request_records;
      const streamedThenFailed = point.expected.attempts.flatMap((attempt, index) =>
        attempt.outcome !== 'completed' && attempt.ttft_ms !== null ? [index] : [],
      );
      expect(streamedThenFailed.length).toBeGreaterThanOrEqual(2);
      for (const index of streamedThenFailed) {
        // The client recorded the first token it saw, and the failure.
        expect(columns.ttft_ms[index]).toBeGreaterThan(0);
        expect(outcomes[columns.outcome[index]!]).toBe(point.expected.attempts[index].outcome);
      }
      // With targets nothing measured could miss, the passing count is still
      // only the attempts that completed with evidence.
      const generous = await load(dir, {
        maxTtftMs: 3_600_000,
        maxTpotMs: 3_600_000,
        maxE2eS: null,
        requiredAttainment: 0.5,
      });
      try {
        const evaluated = generous.config.points.find((entry) => entry.load === 1)!;
        expect(evaluated.counts).toMatchObject({ passing: 94, notPassing: 6 });
        expect(evaluated.counts!.withinTtft).toBe(94);
      } finally {
        await generous.db.close();
      }
    });

    it('shows omitted columns as insufficient data with the recorded count and limit', async () => {
      const omitted = manifest.points.find((point) => point.expected.columns_omitted)!;
      expect(omitted.uploaded_as_bmk).not.toBeNull();
      const id = loaded.ingest.idByConc.get(omitted.conc)!;
      const sources = await getSlaAttemptsSources(loaded.sql, [id]);
      expect(sources[id]).toMatchObject({ kind: 'unavailable', reason: 'request_columns_omitted' });
      const point = loaded.config.points.find((entry) => entry.load === omitted.conc)!;
      expect(point.qualification).toMatchObject({
        status: 'insufficient_data',
        reason: 'request_columns_omitted',
      });
      expect(point.unavailable).toEqual({
        reason: 'request_columns_omitted',
        detail: `attempts_exceed_aggregate_limit: ${omitted.num_prompts} attempts, limit ${omitted.aggregate_attempt_limit}`,
      });
      expect(point.observed).toBeNull();
      expect(point.counts).toBeNull();
      expect(loaded.ingest.requestRecords.unavailable).toEqual({ columns_omitted: 1 });
    });

    it('never ingests the point whose job failed, and can still read its block', () => {
      const failed = manifest.points.find((point) => point.expected.gate_status === 'failed')!;
      // The job uploads no result row, so ingest never sees the point.
      expect(failed.uploaded_as_bmk).toBeNull();
      expect(loaded.ingest.idByConc.has(failed.conc)).toBe(false);
      expect(loaded.config.points.some((point) => point.load === failed.conc)).toBe(false);
      // Its aggregate exists in the always-uploaded bundle. The official mapper
      // skips it as a failed run; the adapter reads every failure class from it.
      const row = readSyntheticRow(dir, failed.aggregate);
      const tracker = createSkipTracker();
      expect(mapBenchmarkRow(row, tracker)).toBeNull();
      expect(tracker.skips.failedRun).toBe(1);
      const adapted = slaAttemptsFromRequestRecords(row.request_records);
      if (adapted.kind !== 'attempts') throw new Error(adapted.reason);
      expect(adapted.blob.source.requestRecords!.counts.failed).toBe(failed.expected.counts.failed);
      expect(reconcileSlaAccounting(adapted.blob.set, adapted.blob.accounting).failed).toBe(
        failed.expected.counts.failed,
      );
    });

    it('rejects the default synthetic identity in the official mapper', () => {
      const point = pointOf(manifest, 1);
      const row = {
        ...readSyntheticRow(dir, point.uploaded_as_bmk!),
        // What the producer writes when it is not given a registered identity.
        hw: 'synthetic-test',
        infmax_model_prefix: 'synthetic-test',
      };
      const tracker = createSkipTracker();
      expect(mapBenchmarkRow(row, tracker)).toBeNull();
      expect(tracker.skips.unmappedModel + tracker.skips.unmappedHw).toBe(1);
    });

    describe('with a row changed after the fact (the client cannot be made to produce these)', () => {
      it('never qualifies a block that says it is not complete, though its counts add up', async () => {
        await withChange(
          (block) => {
            block.accounting = { complete: false, reasons: ['interrupted'] };
          },
          (changed) => {
            const point = changed.config.points.find((entry) => entry.load === 1)!;
            // The same 94 of 100 that met the targets above.
            expect(point.observed).toMatchObject({ attempted: 100, passing: 94 });
            expect(point.accounting).toMatchObject({
              completeness: 'partial',
              reason: 'measurement_incomplete',
              populationEstablished: false,
            });
            expect(point.qualification).toMatchObject({
              status: 'insufficient_data',
              reason: 'measurement_incomplete',
              exploratory: true,
            });
            expect((point.source as SlaPointEvaluation['source']).abortReason).toBe(
              'accounting incomplete: interrupted',
            );
            expect(changed.view.qualifying).toEqual([]);
            expect(changed.config.status).toBe('insufficient_data');
            expect(changed.config.selections.highestPassingLoad).toBeNull();
          },
        );
      });

      it('treats a block without a completeness statement as incomplete', async () => {
        await withChange(
          (block) => {
            delete block.accounting;
          },
          (changed) => {
            const point = changed.config.points.find((entry) => entry.load === 1)!;
            expect(point.qualification.reason).toBe('measurement_incomplete');
            expect((point.source as SlaPointEvaluation['source']).abortReason).toBe(
              'accounting incomplete: accounting_not_stated',
            );
          },
        );
      });

      it('refuses an unknown schema version with the reason', async () => {
        await withChange(
          (block) => {
            block.schema_version = 99;
          },
          (changed) => {
            const point = changed.config.points.find((entry) => entry.load === 1)!;
            expect(point.unavailable).toEqual({
              reason: 'request_records_unreadable',
              detail: 'schema_version 99',
            });
            expect(point.qualification).toMatchObject({
              status: 'insufficient_data',
              reason: 'request_records_unreadable',
            });
            expect(point.observed).toBeNull();
          },
        );
      });

      it('refuses columns of unequal length rather than evaluating part of them', async () => {
        await withChange(
          (block) => {
            (block.columns as Record<string, unknown[]>).ttft_ms.pop();
          },
          (changed) => {
            const point = changed.config.points.find((entry) => entry.load === 1)!;
            expect(point.unavailable?.reason).toBe('request_records_unreadable');
            expect(point.observed).toBeNull();
          },
        );
      });
    });
  });
}

describePath('committed synthetic output', () => GOLDEN_SYNTHETIC_POINT_DIR);

describe.runIf(LIVE)('request-records round trip from a benchmark checkout', () => {
  let fresh = '';

  beforeAll(() => {
    const checkout = process.env.INFERENCEX_CHECKOUT;
    if (!checkout || !fs.existsSync(path.join(checkout, 'inferencex-e2e'))) {
      throw new Error(
        'Set INFERENCEX_CHECKOUT to a checkout of the benchmark repository that has ' +
          'inferencex-e2e/infx/tests/bench_serving/synthetic_point.py',
      );
    }
    fresh = produce(checkout);
  }, 660_000);

  it('produces the shape the committed fixture has', () => {
    expect(syntheticPointShape(fresh)).toEqual(syntheticPointShape(GOLDEN_SYNTHETIC_POINT_DIR));
  });

  describePath('freshly produced output', () => fresh);
});

it('compares shapes strictly enough to notice a producer change', () => {
  const golden = syntheticPointShape(GOLDEN_SYNTHETIC_POINT_DIR);
  const changed = fs.mkdtempSync(path.join(os.tmpdir(), 'sla-shape-'));
  try {
    fs.cpSync(GOLDEN_SYNTHETIC_POINT_DIR, changed, { recursive: true });
    expect(syntheticPointShape(changed)).toEqual(golden);
    // A producer that renamed a column, or scripted one attempt differently, is noticed.
    const point = readSyntheticManifest(changed).points[0];
    const file = path.join(changed, point.aggregate);
    const row = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      request_records: { columns: Record<string, unknown[]> };
    };
    const { columns } = row.request_records;
    columns.first_token_ms = columns.ttft_ms;
    delete columns.ttft_ms;
    fs.writeFileSync(file, JSON.stringify(row));
    expect(syntheticPointShape(changed)).not.toEqual(golden);
  } finally {
    fs.rmSync(changed, { recursive: true, force: true });
  }
});

it('keeps the default targets of the page out of this test', () => {
  // The scripted latencies are tens of milliseconds; the example targets would pass everything.
  expect(TARGETS.maxTtftMs).toBeLessThan(SLA_EXAMPLE_TARGETS.maxTtftMs);
});
