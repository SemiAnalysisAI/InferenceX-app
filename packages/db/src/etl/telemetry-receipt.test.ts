import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../connection';
import { getGpuMetricsForPoint } from '../queries/gpu-metrics';
import type * as DbUtils from './db-utils';
import type { Sql } from './db-utils';
import { ingestGpuMetricsArtifact } from './gpu-metrics-ingest';
import {
  fatalPublicationErrors,
  stablePowerPointIdentity,
  type PowerPublicationManifest,
} from './power-publication';
import {
  readTelemetryReceipt,
  summarizeTelemetryReceipt,
  verifyTelemetryApi,
  telemetryArtifactsForAttempt,
  type TelemetryObservation,
} from './telemetry-receipt';

let db: PGlite;
let sql: Sql;
const roots: string[] = [];
const run = { runId: 123, runAttempt: 2 };
vi.mock('./db-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof DbUtils>()),
  createAdminSql: () => Object.assign(sql, { end: async () => {} }),
}));
function queryClient(database: Pick<PGlite, 'query'>) {
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((query, part, i) => query + (i ? `$${i}` : '') + part, '');
    const result = await database.query(text, values);
    return result.rows;
  };
  return Object.assign(client, { json: JSON.stringify, array: (value: unknown) => value });
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql'])
    await db.exec(fs.readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  await db.exec(
    "alter table benchmark_results add column offload_mode text not null default 'off'; alter table benchmark_results add column recipe_fingerprint text; alter table benchmark_results add column workers jsonb; alter table benchmark_results add column power_audit jsonb;",
  );
  sql = Object.assign(queryClient(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(queryClient(tx) as unknown as Sql)),
  }) as unknown as Sql;
}, 20_000);

beforeEach(async () => {
  await db.exec(`truncate workflow_runs, configs restart identity cascade;
    insert into workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    values (1, 123, 2, 'Sweep', '2026-09-21', '2026-09-21'),
      (2, 123, 1, 'Previous attempt', '2026-09-20', '2026-09-20');
    insert into configs (id, model, hardware, framework, precision, spec_method, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    values (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', 1, 1, 1, 1);
    insert into benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
    values (10, 1, 1, 'single_turn', '2026-09-21', 8192, 1024, 1, '{}'),
      (11, 1, 1, 'single_turn', '2026-09-21', 8192, 1024, 2, '{}'),
      (12, 1, 1, 'single_turn', '2026-09-21', 8192, 1024, 3, '{}'),
      (13, 1, 1, 'single_turn', '2026-09-21', 8192, 1024, 4, '{}'),
      (20, 2, 1, 'single_turn', '2026-09-20', 8192, 1024, 1, '{}');`);
});
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
afterAll(async () => {
  await db?.close();
});

function artifact(name: string) {
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-receipt-'));
  roots.push(artifactDir);
  fs.writeFileSync(
    path.join(artifactDir, 'gpu_metrics.csv'),
    'timestamp, index, power.draw [W]\n2026/09/21 00:00:00.000, 0, 100 W\n2026/09/21 00:00:01.000, 0, 200 W',
  );
  return { artifactName: name, artifactDir };
}
async function observations(): Promise<TelemetryObservation[]> {
  const rows =
    await sql`select c.*, br.id, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode, br.recipe_fingerprint
    from benchmark_results br join configs c on c.id = br.config_id where br.workflow_run_id = 1 order by br.id`;
  return rows.map((identity, i) => ({
    identity,
    artifactNames: [`gpu_metrics_point${i + 1}`],
    produced: true,
  }));
}

describe('telemetry attachment receipts', () => {
  it('preserves an unrelated prior artifact failure at the canonical offload identity', async () => {
    await db.exec("UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 10");
    const [canonical] = await observations();
    canonical!.error = 'prior artifact failed';
    const previous = await readTelemetryReceipt(sql, run, [canonical!]);
    const alias = {
      identity: { ...canonical!.identity, offload_mode: 'off' },
      artifactNames: ['gpu_metrics_other'],
      produced: true,
    };
    const receipt = await readTelemetryReceipt(sql, run, [alias], {
      previous,
      targeted: true,
      uniqueFallbacks: new Map([[stablePowerPointIdentity(alias.identity), 10]]),
    });
    expect(receipt.points.find((p) => p.benchmarkResultId === 10)).toEqual(
      previous.points.find((p) => p.benchmarkResultId === 10),
    );
    expect(receipt.counts.expectedPoints).toBeNull();
  });

  it('retains conflicting artifact observations when a historical fallback reaches an occupied identity', async () => {
    await db.exec("UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 10");
    const [canonical] = await observations();
    const alias = {
      ...canonical!,
      identity: { ...canonical!.identity, offload_mode: 'off' },
      artifactNames: ['gpu_metrics_other'],
      error: 'failed correction',
    };
    const receipt = await readTelemetryReceipt(sql, run, [canonical!, alias], {
      uniqueFallbacks: new Map([[stablePowerPointIdentity(alias.identity), 10]]),
    });
    expect(receipt.counts.expectedPoints).toBeNull();
    expect(
      receipt.points.find((p) => p.key === stablePowerPointIdentity(alias.identity)),
    ).toMatchObject({
      error: 'failed correction',
      benchmarkResultId: null,
      artifactNames: ['gpu_metrics_other'],
    });
    expect(receipt.points.find((p) => p.benchmarkResultId === 10)?.artifactNames).toEqual(
      canonical!.artifactNames,
    );
  });

  it.each([11, 20])(
    'does not canonicalize a fallback to a different point or attempt (id=%s)',
    async (id) => {
      const [source] = await observations();
      const alias = { ...source!, identity: { ...source!.identity, offload_mode: 'on' } };
      const previous = await readTelemetryReceipt(sql, run, [alias]);
      const receipt = await readTelemetryReceipt(sql, run, [alias], {
        previous,
        targeted: true,
        uniqueFallbacks: new Map([[stablePowerPointIdentity(alias.identity), id]]),
      });
      expect(receipt.counts.expectedPoints).toBe(previous.counts.expectedPoints);
      expect(
        receipt.points.find((p) => p.key === stablePowerPointIdentity(alias.identity)),
      ).toMatchObject({
        benchmarkResultId: null,
        identity: { conc: 1, offload_mode: 'on' },
      });
    },
  );

  it('persists real HTTP query results through the publication verifier without failing benchmark publication', async () => {
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact('gpu_metrics_point1'),
      benchmarkResultIds: [10],
    });
    const points = await observations();
    points[1]!.produced = false;
    const telemetry = await readTelemetryReceipt(sql, run, points, {
      expectedSource: 'benchmark_artifacts',
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-verifier-'));
    roots.push(directory);
    const manifestPath = path.join(directory, 'power-publication.json');
    const manifest: PowerPublicationManifest = {
      version: 1,
      ...run,
      points: points.map((point) => ({
        identity: point.identity,
        metrics: {},
        workers: null,
        power_invalid_reasons: null,
        power_audit: null,
        artifact: { path: 'bmk_fixture/results.json', sha256: 'fixture' },
      })),
      telemetryWarnings: ['Fixture telemetry unavailable for three benchmark points'],
      telemetry,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const requests: string[] = [];
    let unavailable = false;
    // Exercise the production SQL reader over loopback HTTP. This does not
    // stand in for a Next deployment, Blob/CDN, or retained-artifact replay.
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url!, 'http://127.0.0.1');
        requests.push(url.pathname + url.search);
        let payload: unknown;
        if (url.pathname === '/api/v1/benchmarks') {
          payload = await sql`select c.*, br.* from benchmark_results br
            join configs c on c.id = br.config_id where br.workflow_run_id = 1`;
        } else if (unavailable) {
          response.writeHead(503).end();
          return;
        } else {
          payload = await getGpuMetricsForPoint(
            sql as unknown as DbClient,
            Number(url.searchParams.get('id')),
          );
        }
        response.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(payload));
      } catch (error) {
        response.writeHead(500).end(String(error));
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      process.argv = [
        'bun',
        'verify-power-publication.ts',
        manifestPath,
        `http://127.0.0.1:${address.port}`,
      ];
      await import('../verify-power-publication');
      const result = JSON.parse(fs.readFileSync(`${manifestPath}.verification.json`, 'utf8'));
      const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(result).toMatchObject({ status: 'matched', points: 4, errors: [] });
      expect(result.telemetryWarnings).toEqual(manifest.telemetryWarnings);
      expect(result.telemetry).toEqual(updated.telemetry);
      expect(result.telemetry.counts).toMatchObject({
        expectedPoints: 4,
        apiReadablePoints: 1,
        apiCompletePoints: 1,
        apiUnknownPoints: 0,
      });
      expect(result.telemetry.plannedPointCount).toBeNull();
      expect(requests).toHaveLength(5);
      expect(requests[0]).toContain('runId=123&exactRun=true');
      expect(
        result.telemetry.points.find(
          (point: { benchmarkResultId: number }) => point.benchmarkResultId === 11,
        ).api.error,
      ).toBe('HTTP 404');
      expect(process.exitCode).toBe(originalExitCode);

      unavailable = true;
      vi.resetModules();
      await import('../verify-power-publication');
      const failed = JSON.parse(fs.readFileSync(`${manifestPath}.verification.json`, 'utf8'));
      expect(failed).toMatchObject({ status: 'matched', errors: [] });
      expect(failed.telemetry.counts).toMatchObject({ apiReadablePoints: 0, apiCompletePoints: 0 });
      expect(
        failed.telemetry.points.every(
          (point: { api: { error: string } }) => point.api.error === 'HTTP 503',
        ),
      ).toBe(true);
      expect(process.exitCode).toBe(originalExitCode);
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
      log.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('isolates the source attempt before selecting or downloading artifact pairs', () => {
    const old = {
      name: 'gpu_metrics_old',
      created_at: '2026-09-20T00:00:00Z',
      archive_download_url: 'old',
    };
    const current = {
      name: 'gpu_metrics_new',
      created_at: '2026-09-21T01:00:00Z',
      archive_download_url: 'new',
    };
    const source = { run_attempt: 2, run_started_at: '2026-09-21T00:00:00Z' };
    expect(telemetryArtifactsForAttempt([old, current], source, 2)).toEqual([current]);
    expect(() => telemetryArtifactsForAttempt([old, current], source, 1)).toThrow('mixed-attempt');
    expect(() => telemetryArtifactsForAttempt([current], { run_attempt: 2 }, 2)).toThrow(
      'start time',
    );
  });
  it('retains missing/failed/unlinked point identities and targeted recovery changes only the repaired point', async () => {
    const points = await observations();
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact('gpu_metrics_point1'),
      benchmarkResultIds: [10],
    });
    points[1]!.produced = false;
    const badArtifact = artifact('gpu_metrics_point3');
    fs.writeFileSync(
      path.join(badArtifact.artifactDir, 'gpu_metrics.csv'),
      'timestamp, index, power.draw [W]\n2026/09/21 00:00:00.000, 999999, 100 W',
    );
    try {
      await ingestGpuMetricsArtifact(sql, {
        workflowRunId: 1,
        artifact: badArtifact,
        benchmarkResultIds: [12],
      });
      throw new Error('Expected the invalid GPU index to fail persistence');
    } catch (error) {
      points[2]!.error = error instanceof Error ? error.message : String(error);
    }
    expect(points[2]!.error).toContain('smallint');
    const orphan = artifact('gpu_metrics_point4');
    const fourth = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: orphan,
      benchmarkResultIds: [13],
    });
    await sql`delete from benchmark_result_gpu_metrics where benchmark_result_id = 13`;
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 2,
      artifact: artifact('gpu_metrics_point1'),
      benchmarkResultIds: [20],
    });
    const receipt = await readTelemetryReceipt(sql, run, points, {
      expectedSource: 'benchmark_artifacts',
    });
    expect(receipt.counts).toEqual({
      expectedPoints: 4,
      producedPoints: 3,
      productionUnknownPoints: 0,
      storedPoints: 2,
      linkedPoints: 1,
      storageUnknownPoints: 0,
      apiReadablePoints: 0,
      apiCompletePoints: 0,
      apiUnknownPoints: 4,
      producedArtifacts: 3,
      storedSeries: 2,
      storedSamples: 4,
    });
    expect(receipt.plannedPointCount).toBeNull();
    expect(receipt.points.find((p) => p.benchmarkResultId === 11)?.reasons).toContain(
      'artifact_missing',
    );
    expect(receipt.points.find((p) => p.benchmarkResultId === 12)).toMatchObject({
      error: points[2]!.error,
      reasons: ['ingest_failed', 'series_not_stored'],
    });
    const missingLink = receipt.points.find((p) => p.benchmarkResultId === 13)!;
    expect(missingLink.reasons).toEqual(['point_link_missing']);
    expect(missingLink.series).toEqual([
      {
        id: fourth.seriesIds[0],
        artifactName: 'gpu_metrics_point4',
        fileName: 'gpu_metrics.csv',
        sampleCount: 2,
      },
    ]);
    expect(missingLink.recovery).toEqual({
      runId: 123,
      runAttempt: 2,
      artifactNames: ['gpu_metrics_point4'],
    });
    receipt.expectationErrors = [
      {
        benchmarkArtifact: 'bmk_unreadable',
        artifactNames: ['gpu_metrics_unreadable'],
        error: 'Download failed',
      },
    ];
    expect(summarizeTelemetryReceipt(receipt).counts.expectedPoints).toBeNull();
    const refreshed = await readTelemetryReceipt(sql, run, points, { previous: receipt });
    expect(refreshed.expectationErrors).toEqual(receipt.expectationErrors);
    expect(refreshed.counts.expectedPoints).toBeNull();
    const recovered = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: orphan,
      benchmarkResultIds: [13],
    });
    expect(recovered.samplesInserted).toBe(0);
    const repaired = await readTelemetryReceipt(sql, run, [points[3]!], {
      previous: receipt,
      targeted: true,
    });
    expect(repaired.points).toHaveLength(4);
    expect(repaired.expectationErrors).toEqual(receipt.expectationErrors);
    expect(repaired.counts.expectedPoints).toBeNull();
    expect(repaired.counts).toMatchObject({ storedSeries: 2, storedSamples: 4, linkedPoints: 2 });
    expect(repaired.points.find((p) => p.benchmarkResultId === 13)?.reasons).toEqual([]);
    expect(repaired.points.filter((p) => p.benchmarkResultId !== 13)).toEqual(
      receipt.points.filter((p) => p.benchmarkResultId !== 13),
    );
    expect(repaired.points.find((p) => p.benchmarkResultId === 10)?.series).toEqual([
      {
        id: first.seriesIds[0],
        artifactName: 'gpu_metrics_point1',
        fileName: 'gpu_metrics.csv',
        sampleCount: 2,
      },
    ]);
    expect(fatalPublicationErrors({ telemetryWarnings: ['CSV parse failed'] }, [])).toEqual([]);
  });

  it('counts a shared series once and keeps unavailable expectations unknown', async () => {
    const points = await observations();
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact('gpu_metrics_shared'),
      benchmarkResultIds: [10, 11],
    });
    const receipt = await readTelemetryReceipt(
      sql,
      run,
      points.slice(0, 2).map((p) => ({ ...p, artifactNames: ['gpu_metrics_shared'] })),
    );
    expect(receipt.counts).toMatchObject({
      expectedPoints: 4,
      storedPoints: 2,
      linkedPoints: 2,
      storedSeries: 1,
      storedSamples: 2,
      productionUnknownPoints: 2,
    });
    const unavailable = await readTelemetryReceipt(sql, { runId: 999, runAttempt: 1 }, [], {
      expectedSource: 'unknown',
    });
    expect(unavailable.counts.expectedPoints).toBeNull();
    await expect(
      readTelemetryReceipt(sql, { runId: 123, runAttempt: 1 }, [], { previous: receipt }),
    ).rejects.toThrow('run/attempt');
  });

  it('keeps a partial host artifact incomplete until targeted recovery restores its inventory', async () => {
    const points = await observations();
    const multi = artifact('gpu_metrics_point1');
    const csv = fs.readFileSync(path.join(multi.artifactDir, 'gpu_metrics.csv'));
    fs.unlinkSync(path.join(multi.artifactDir, 'gpu_metrics.csv'));
    for (const host of ['host-a', 'host-b']) {
      fs.mkdirSync(path.join(multi.artifactDir, host));
      fs.writeFileSync(path.join(multi.artifactDir, host, 'gpu_metrics.csv'), csv);
    }
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: multi,
      benchmarkResultIds: [10],
    });
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact('gpu_metrics_point4'),
      benchmarkResultIds: [13],
    });
    await sql`delete from gpu_metric_series where file_name = 'host-b/gpu_metrics.csv'`;
    const receipt = await readTelemetryReceipt(sql, run, points);
    const partial = receipt.points.find((point) => point.benchmarkResultId === 10)!;
    expect(partial.storage).toEqual({
      status: 'incomplete',
      expectedSeries: [
        { artifactName: 'gpu_metrics_point1', fileName: 'host-a/gpu_metrics.csv', sampleCount: 2 },
        { artifactName: 'gpu_metrics_point1', fileName: 'host-b/gpu_metrics.csv', sampleCount: 2 },
      ],
    });
    expect(partial.series).toMatchObject([{ fileName: 'host-a/gpu_metrics.csv', sampleCount: 2 }]);
    expect(partial.reasons).toContain('series_coverage_incomplete');
    expect(partial.recovery).toEqual({ ...run, artifactNames: ['gpu_metrics_point1'] });
    expect(receipt.counts).toMatchObject({
      storedPoints: 1,
      linkedPoints: 1,
      storedSeries: 2,
      storedSamples: 4,
    });
    await verifyTelemetryApi(receipt, 'http://local.test', {
      fetch: (input) =>
        Promise.resolve(
          new URL(String(input)).searchParams.get('id') === '10'
            ? Response.json({
                benchmarkResultId: 10,
                series: partial.series.map((entry) => ({
                  id: entry.id,
                  sampleCount: entry.sampleCount,
                  data: [{ power: 100 }, { power: 200 }],
                })),
              })
            : new Response('missing', { status: 404 }),
        ),
    });
    expect(partial.api.status).toBe('readable');
    expect(receipt.counts).toMatchObject({ apiReadablePoints: 1, apiCompletePoints: 0 });
    const recovered = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: multi,
      benchmarkResultIds: [10],
    });
    expect(recovered).toMatchObject({ seriesSkipped: 1, samplesInserted: 2 });
    const repaired = await readTelemetryReceipt(sql, run, [points[0]!], {
      previous: receipt,
      targeted: true,
    });
    const repairedPoint = repaired.points.find((point) => point.benchmarkResultId === 10)!;
    expect(repairedPoint.storage.status).toBe('complete');
    expect(repairedPoint.reasons).toEqual([]);
    expect(repairedPoint.api.status).toBe('unknown');
    expect(repaired.counts).toMatchObject({
      storedPoints: 2,
      linkedPoints: 2,
      storedSeries: 3,
      storedSamples: 6,
    });
    expect(repaired.points.filter((point) => point.benchmarkResultId !== 10)).toEqual(
      receipt.points.filter((point) => point.benchmarkResultId !== 10),
    );
    const replay = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: multi,
      benchmarkResultIds: [10],
    });
    expect(replay).toMatchObject({ seriesSkipped: 2, samplesInserted: 0 });
    const sampleCount = await sql`select count(*)::int as count from gpu_metric_samples`;
    expect(sampleCount).toEqual([{ count: 6 }]);
  });

  it('distinguishes missing sample coverage from legacy unknown inventory', async () => {
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact('gpu_metrics_point1'),
      benchmarkResultIds: [10],
    });
    await sql`delete from gpu_metric_samples where sampled_at = '2026-09-21T00:00:01Z'`;
    const partial = await readTelemetryReceipt(sql, run, await observations());
    expect(partial.points.find((point) => point.benchmarkResultId === 10)?.reasons).toContain(
      'sample_coverage_incomplete',
    );
    expect(partial.counts).toMatchObject({ storedPoints: 0, linkedPoints: 0, storedSamples: 1 });
    await sql`update gpu_metric_series set sidecars = sidecars - 'seriesInventory'`;
    const legacy = await readTelemetryReceipt(sql, run, await observations());
    expect(legacy.points.find((point) => point.benchmarkResultId === 10)).toMatchObject({
      storage: { status: 'unknown', expectedSeries: null },
      reasons: ['series_inventory_unknown'],
    });
    expect(legacy.counts).toMatchObject({
      storedPoints: 0,
      linkedPoints: 0,
      storageUnknownPoints: 1,
    });
  });

  it('does not count readable old data as a successful corrective ingest', async () => {
    const source = artifact('gpu_metrics_point1');
    const csvPath = path.join(source.artifactDir, 'gpu_metrics.csv');
    const originalCsv = fs.readFileSync(csvPath, 'utf8');
    const original = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: source,
      benchmarkResultIds: [10],
    });
    const points = await observations();
    fs.writeFileSync(csvPath, originalCsv.replaceAll(', 0,', ', 999999,'));
    try {
      await ingestGpuMetricsArtifact(sql, {
        workflowRunId: 1,
        artifact: source,
        benchmarkResultIds: [10],
      });
      throw new Error('Expected the corrective ingest to fail');
    } catch (error) {
      points[0]!.error = error instanceof Error ? error.message : String(error);
    }
    expect(points[0]!.error).toContain('smallint');
    const failed = await readTelemetryReceipt(sql, run, points);
    const fetcher: typeof fetch = (input) =>
      Promise.resolve(
        new URL(String(input)).searchParams.get('id') === '10'
          ? Response.json({
              benchmarkResultId: 10,
              series: [
                {
                  id: original.seriesIds[0],
                  sampleCount: 2,
                  data: [{ power: 100 }, { power: 200 }],
                },
              ],
            })
          : new Response('missing', { status: 404 }),
      );
    await verifyTelemetryApi(failed, 'http://local.test', { fetch: fetcher });
    expect(failed.points.find((point) => point.benchmarkResultId === 10)).toMatchObject({
      storage: { status: 'complete' },
      api: { status: 'readable' },
      reasons: ['ingest_failed'],
    });
    expect(failed.counts).toMatchObject({
      storedPoints: 1,
      apiReadablePoints: 1,
      apiCompletePoints: 0,
    });

    fs.writeFileSync(csvPath, originalCsv);
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: source,
      benchmarkResultIds: [10],
    });
    delete points[0]!.error;
    const repaired = await readTelemetryReceipt(sql, run, [points[0]!], {
      previous: failed,
      targeted: true,
    });
    await verifyTelemetryApi(repaired, 'http://local.test', { fetch: fetcher });
    expect(repaired.points.find((point) => point.benchmarkResultId === 10)?.error).toBeUndefined();
    expect(repaired.counts.apiCompletePoints).toBe(1);

    repaired.recoveryError = 'Artifact recovery did not finish';
    repaired.recoveryArtifactNames = ['gpu_metrics_point1'];
    expect(summarizeTelemetryReceipt(repaired).counts).toMatchObject({
      apiReadablePoints: 1,
      apiCompletePoints: 0,
    });
    const retried = await readTelemetryReceipt(sql, run, [points[0]!], {
      previous: repaired,
      targeted: true,
    });
    await verifyTelemetryApi(retried, 'http://local.test', { fetch: fetcher });
    expect(retried.recoveryError).toBeUndefined();
    expect(retried.counts.apiCompletePoints).toBe(1);
  });

  it('does not clear a failed recovery when only an unrelated artifact is repaired', async () => {
    const points = await observations();
    for (const index of [0, 1])
      await ingestGpuMetricsArtifact(sql, {
        workflowRunId: 1,
        artifact: artifact(`gpu_metrics_point${index + 1}`),
        benchmarkResultIds: [10 + index],
      });
    const previous = await readTelemetryReceipt(sql, run, points);
    previous.recoveryError = 'No retained telemetry pair for gpu_metrics_point1';
    previous.recoveryArtifactNames = ['gpu_metrics_point1'];
    const stillMissing = await readTelemetryReceipt(
      sql,
      run,
      [{ ...points[0]!, produced: false }, points[1]!],
      { previous },
    );
    expect(stillMissing.recoveryError).toBe(previous.recoveryError);
    expect(stillMissing.recoveryArtifactNames).toEqual(['gpu_metrics_point1']);
    const unrelated = await readTelemetryReceipt(sql, run, [points[1]!], {
      previous,
      targeted: true,
    });
    expect(unrelated.recoveryError).toBe(previous.recoveryError);
    expect(unrelated.recoveryArtifactNames).toEqual(['gpu_metrics_point1']);
    await verifyTelemetryApi(unrelated, 'http://local.test', {
      fetch: async (input) => {
        const payload = await getGpuMetricsForPoint(
          sql as unknown as DbClient,
          Number(new URL(String(input)).searchParams.get('id')),
        );
        return payload ? Response.json(payload) : new Response(null, { status: 404 });
      },
    });
    expect(unrelated.counts).toMatchObject({ apiReadablePoints: 2, apiCompletePoints: 0 });
    const recovered = await readTelemetryReceipt(sql, run, [points[0]!], {
      previous: unrelated,
      targeted: true,
    });
    expect(recovered.recoveryError).toBeUndefined();
    expect(recovered.recoveryArtifactNames).toBeUndefined();

    previous.recoveryArtifactNames = ['gpu_metrics_point1', 'gpu_metrics_point2'];
    const firstRepair = await readTelemetryReceipt(sql, run, [points[0]!], {
      previous,
      targeted: true,
    });
    expect(firstRepair.recoveryArtifactNames).toEqual(['gpu_metrics_point2']);
    const secondRepair = await readTelemetryReceipt(sql, run, [points[1]!], {
      previous: firstRepair,
      targeted: true,
    });
    expect(secondRepair.recoveryError).toBeUndefined();

    delete previous.recoveryArtifactNames;
    const legacy = await readTelemetryReceipt(sql, run, [points[0]!], {
      previous,
      targeted: true,
    });
    expect(legacy.recoveryError).toBe(previous.recoveryError);
    const partialRefresh = await readTelemetryReceipt(sql, run, [points[0]!], { previous: legacy });
    expect(partialRefresh.recoveryError).toBe(previous.recoveryError);
    const refreshed = await readTelemetryReceipt(sql, run, points, { previous: legacy });
    expect(refreshed.recoveryError).toBeUndefined();
  });

  it('advances API readability only after the matching HTTP payload, preserving 404/error evidence', async () => {
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact('gpu_metrics_point1'),
      benchmarkResultIds: [10],
    });
    const receipt = await readTelemetryReceipt(sql, run, await observations());
    const point = receipt.points.find((p) => p.benchmarkResultId === 10)!;
    const requests: string[] = [];
    const fetcher: typeof fetch = (input) => {
      const url = new URL(String(input));
      requests.push(url.toString());
      if (url.searchParams.get('id') !== '10')
        return Promise.resolve(new Response('missing', { status: 404 }));
      return Promise.resolve(
        Response.json({
          benchmarkResultId: 10,
          series: [
            { id: point.series[0]!.id, sampleCount: 2, data: [{ power: 100 }, { power: 200 }] },
          ],
        }),
      );
    };
    expect(receipt.counts.apiReadablePoints).toBe(0);
    const checked = await verifyTelemetryApi(receipt, 'http://local.test', { fetch: fetcher });
    expect(requests).toHaveLength(4);
    expect(checked.counts).toMatchObject({
      apiReadablePoints: 1,
      apiCompletePoints: 1,
      apiUnknownPoints: 0,
    });
    expect(point.api.status).toBe('readable');
    expect(checked.points.find((p) => p.benchmarkResultId === 11)?.api.error).toBe('HTTP 404');
    await verifyTelemetryApi(receipt, 'http://local.test', {
      fetch: () => Promise.resolve(Response.json({ benchmarkResultId: 10, series: [] })),
    });
    expect(point.api.status).toBe('failed');
  });
});
