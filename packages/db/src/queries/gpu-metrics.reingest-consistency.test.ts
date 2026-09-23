/**
 * Re-ingest consistency of the PowerX telemetry read path.
 *
 * Property under test: a reader of one benchmark point never observes samples
 * and per-GPU statistics that come from different versions of the same series.
 *
 * `upsertGpuMetricSeries` replaces samples and stats inside one `sql.begin`
 * transaction, so the write side is atomic. `getGpuMetricsForPoint` ->
 * `loadSeriesDetails`, however, issues separate autocommit statements (series
 * rows, then `gpu_metric_gpu_stats`, then `gpu_metric_samples`). In production
 * the DbClient is either neon() HTTP (one implicit transaction per call) or a
 * postgres.js pool used without a transaction, so a re-ingest can commit between
 * the stats and the samples statement. The reader re-checks the series version
 * key afterwards and restarts the read when it moved.
 *
 * PGlite is single-connection, so the interleaving is simulated at statement
 * granularity: after the stats statement returns, a full re-ingest transaction
 * runs and commits before the samples statement executes. Under READ COMMITTED
 * this is observationally identical to a second connection committing between
 * the two autocommit statements.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DbClient } from '../connection';
import { ingestGpuMetricsArtifact } from '../etl/gpu-metrics-ingest';
import {
  getGpuMetricsForPoint,
  type GpuMetricSeries,
  TelemetrySnapshotChangedError,
} from './gpu-metrics';

type Sql = postgres.Sql;
let db: PGlite;
/** Writer handle: the ingest code calls `sql.begin`, `sql.array`, `sql.json`. */
let sql: Sql;
/** Reader handle: plain autocommit statements, as the app's DbClient issues them. */
let reader: DbClient;
const roots: string[] = [];

function queryClient(database: Pick<PGlite, 'query'>) {
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    const result = await database.query<Record<string, unknown>>(query, values);
    return result.rows;
  };
  return Object.assign(client, {
    json: JSON.stringify,
    array: (value: unknown) => value,
  });
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  }
  // The point reader aggregates benchmark_results.power_audit (migration 015).
  await db.exec('ALTER TABLE benchmark_results ADD COLUMN power_audit jsonb');
  sql = Object.assign(queryClient(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(queryClient(tx) as unknown as Sql)),
  }) as unknown as Sql;
  reader = queryClient(db) as DbClient;
}, 20_000);

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-09-11', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, 4, 4, 4, 4);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}'),
           (11, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, '{}');`);
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db?.close();
});

/** Version 1: 2 GPUs x 2 distinct timestamps (+ duplicate flush row) = 4 unique samples. */
const NVIDIA_CSV_V1 = [
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
  '2026/09/11 04:19:41.982, 0, 187.80 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
  '2026/09/11 04:19:41.986, 1, 190.96 W, 39, 120 MHz, 3996 MHz, 0 %, 0 %',
  '2026/09/11 04:19:42.990, 0, 912.10 W, 61, 1965 MHz, 3996 MHz, 98 %, 74 %',
  '2026/09/11 04:19:42.994, 1, 905.30 W, 62, 1965 MHz, 3996 MHz, 97 %, 73 %',
  // Duplicate flush of the last sample, as emitted when the monitor stops.
  '2026/09/11 04:19:42.994, 1, 905.30 W, 62, 1965 MHz, 3996 MHz, 97 %, 73 %',
].join('\n');

/**
 * Version 1 + `extraScrapes` further scrapes per GPU, each at a distinct
 * timestamp, so every version has a distinct CSV digest and sample count.
 */
function csvVersion(extraScrapes: number): string {
  const lines = [NVIDIA_CSV_V1];
  for (let i = 0; i < extraScrapes; i += 1) {
    const second = String(43 + i).padStart(2, '0');
    lines.push(
      `2026/09/11 04:19:${second}.990, 0, 700.00 W, 60, 1900 MHz, 3996 MHz, 90 %, 70 %`,
      `2026/09/11 04:19:${second}.994, 1, 702.50 W, 61, 1900 MHz, 3996 MHz, 91 %, 71 %`,
    );
  }
  return lines.join('\n');
}

/** Version 2: the same artifact re-uploaded with one more scrape per GPU = 6 unique samples. */
const NVIDIA_CSV_V2 = csvVersion(1);
/** Version 3: one more scrape per GPU again = 8 unique samples. */
const NVIDIA_CSV_V3 = csvVersion(2);

const V1_UNIQUE_SAMPLES = 4;
const V2_UNIQUE_SAMPLES = 6;
const V3_UNIQUE_SAMPLES = 8;

function writeArtifact(csv: string, contextZone = 'UTC') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-metrics-reingest-'));
  roots.push(root);
  const artifactName = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0';
  const artifactDir = path.join(root, artifactName);
  fs.mkdirSync(artifactDir);
  fs.writeFileSync(path.join(artifactDir, 'gpu_metrics.csv'), csv);
  fs.writeFileSync(
    path.join(artifactDir, 'gpu_metrics_context.json'),
    JSON.stringify({ timestamp_timezone: contextZone }),
  );
  fs.writeFileSync(
    path.join(artifactDir, 'gpu_metrics_identity.csv'),
    'index, uuid, name\n0, GPU-a, NVIDIA B200\n1, GPU-b, NVIDIA B200\n',
  );
  return { artifactName, artifactDir };
}

function ingest(csv: string) {
  return ingestGpuMetricsArtifact(sql, {
    workflowRunId: 1,
    artifact: writeArtifact(csv),
    benchmarkResultIds: [10],
  });
}

interface InterleavedReader {
  client: DbClient;
  /** How many times the reader issued its first statement (the point's series rows). */
  seriesReads: () => number;
}

/**
 * A DbClient that forwards every statement to `base`, but after each
 * `gpu_metric_gpu_stats` statement has returned (and before the caller gets
 * the rows back), runs `between(statsReadIndex)` to completion. With a
 * committed re-ingest in `between`, this is the schedule: reader(series),
 * reader(stats), WRITER COMMITS, reader(samples), reader(version check).
 */
function interleaveAfterStats(
  base: DbClient,
  between: (statsReadIndex: number) => Promise<unknown>,
): InterleavedReader {
  let statsReads = 0;
  let seriesReads = 0;
  const client: DbClient = async (strings, ...values) => {
    const text = strings.join('');
    if (/from benchmark_result_gpu_metrics link/.test(text)) seriesReads += 1;
    const rows = await base(strings, ...values);
    if (/from gpu_metric_gpu_stats/.test(text)) {
      statsReads += 1;
      await between(statsReads);
    }
    return rows;
  };
  return { client, seriesReads: () => seriesReads };
}

/**
 * The consistency property: every statistic row was computed over exactly the
 * sample rows returned in the same payload, and the series header agrees.
 */
function expectCoherent(series: GpuMetricSeries) {
  for (const stat of series.stats) {
    const rowsForGpu = series.data.filter((row) => row.index === stat.gpuIndex).length;
    expect(stat.count, `stats.count for gpu ${stat.gpuIndex}/${stat.metric}`).toBe(rowsForGpu);
  }
  expect(series.sampleCount, 'series.sampleCount vs data.length').toBe(series.data.length);
}

describe('getGpuMetricsForPoint under telemetry re-ingest', () => {
  it('serial read after re-ingest is coherent', async () => {
    const first = await ingest(NVIDIA_CSV_V1);
    expect(first.samplesInserted).toBe(V1_UNIQUE_SAMPLES);
    const second = await ingest(NVIDIA_CSV_V2);
    expect(second.samplesInserted).toBe(V2_UNIQUE_SAMPLES);
    expect(second.seriesIds).toEqual(first.seriesIds);

    const payload = await getGpuMetricsForPoint(reader, 10);
    expect(payload?.series).toHaveLength(1);
    for (const series of payload!.series) {
      expect(series.sampleCount).toBe(V2_UNIQUE_SAMPLES);
      expectCoherent(series);
    }
  });

  it('a re-ingest committed between the stats and samples statements yields one version', async () => {
    const first = await ingest(NVIDIA_CSV_V1);
    expect(first.samplesInserted).toBe(V1_UNIQUE_SAMPLES);

    let reingest: Awaited<ReturnType<typeof ingest>> | undefined;
    const interleaved = interleaveAfterStats(reader, async (statsReadIndex) => {
      if (statsReadIndex === 1) reingest = await ingest(NVIDIA_CSV_V2);
    });

    const payload = await getGpuMetricsForPoint(interleaved.client, 10);

    // The writer really did replace the series inside its own transaction.
    expect(reingest?.samplesInserted).toBe(V2_UNIQUE_SAMPLES);
    expect(reingest?.seriesIds).toEqual(first.seriesIds);
    expect(payload?.series).toHaveLength(1);
    // The version key moved, so the reader restarted from the series statement.
    expect(interleaved.seriesReads()).toBe(2);

    for (const series of payload!.series) {
      expect(series.sampleCount).toBe(V2_UNIQUE_SAMPLES);
      expect(series.data).toHaveLength(V2_UNIQUE_SAMPLES);
      for (const stat of series.stats) expect(stat.count).toBe(V2_UNIQUE_SAMPLES / 2);
      expectCoherent(series);
    }
  });

  it('an identical re-ingest committed between the stats and samples statements is coherent', async () => {
    const first = await ingest(NVIDIA_CSV_V1);
    expect(first.samplesInserted).toBe(V1_UNIQUE_SAMPLES);

    let reingest: Awaited<ReturnType<typeof ingest>> | undefined;
    const interleaved = interleaveAfterStats(reader, async (statsReadIndex) => {
      if (statsReadIndex === 1) reingest = await ingest(NVIDIA_CSV_V1);
    });

    const payload = await getGpuMetricsForPoint(interleaved.client, 10);

    // Unchanged digest, sidecars and sample count: the no-op path wrote nothing.
    expect(reingest?.samplesInserted).toBe(0);
    expect(reingest?.seriesSkipped).toBe(1);
    expect(payload?.series).toHaveLength(1);
    // Same version key, so no retry.
    expect(interleaved.seriesReads()).toBe(1);

    for (const series of payload!.series) {
      expect(series.sampleCount).toBe(V1_UNIQUE_SAMPLES);
      expectCoherent(series);
    }
  });

  it('converges when a second re-ingest lands during the retry', async () => {
    const first = await ingest(NVIDIA_CSV_V1);
    expect(first.samplesInserted).toBe(V1_UNIQUE_SAMPLES);

    const interleaved = interleaveAfterStats(reader, async (statsReadIndex) => {
      if (statsReadIndex === 1) await ingest(NVIDIA_CSV_V2);
      if (statsReadIndex === 2) await ingest(NVIDIA_CSV_V3);
    });

    const payload = await getGpuMetricsForPoint(interleaved.client, 10);

    expect(payload?.series).toHaveLength(1);
    expect(interleaved.seriesReads()).toBe(3);
    for (const series of payload!.series) {
      expect(series.sampleCount).toBe(V3_UNIQUE_SAMPLES);
      expect(series.data).toHaveLength(V3_UNIQUE_SAMPLES);
      expectCoherent(series);
    }
  });

  it('gives up after three attempts when the series keeps changing', async () => {
    const first = await ingest(NVIDIA_CSV_V1);
    expect(first.samplesInserted).toBe(V1_UNIQUE_SAMPLES);

    const interleaved = interleaveAfterStats(reader, async (statsReadIndex) => {
      // Every attempt sees a fresh, distinct version committed under it.
      await ingest(csvVersion(statsReadIndex));
    });

    await expect(getGpuMetricsForPoint(interleaved.client, 10)).rejects.toBeInstanceOf(
      TelemetrySnapshotChangedError,
    );
    expect(interleaved.seriesReads()).toBe(3);
  });
});
