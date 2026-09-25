import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cutPowerAuditBundle } from '../../../app/src/components/gpu-power/power-audit-bundle';
import { storedPowerSeries } from '../../../app/src/components/gpu-power/stored-power-series';
import type { DbClient } from '../connection';
import { ingestGpuMetricsArtifact } from '../etl/gpu-metrics-ingest';
import { getGpuMetricsForPoint, getGpuMetricsForRun } from './gpu-metrics';

let db: PGlite;
let sql: postgres.Sql;
let readSql: DbClient;
let root: string;
const RUN = 34557177019;
const NAME = 'power_audit_qwen3.5_8k1k_fp8_dynamo-sglang_b200-slurm_0';
const SOURCE = 'power_validation_qwen3.5_8k1k_fp8_dynamo-sglang_b200-slurm_0_conc32.json';
const START = 1789194365;
const CSV = [
  'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
  `1,${START - 61},0,host-a,0,GPU-a0,1`, // outside the existing 60 s pad
  `1,${START - 60},1,host-a,0,GPU-a0,0`, // genuine zero must survive
  `1,${START + 0.1},2,host-b,0,GPU-b0,450`,
  `1,${START + 0.1},2,host-a,0,GPU-a0,300`,
  `1,${START + 0.1},2,host-a,0,GPU-a0,300`, // identical duplicate flush
  `1,${START + 0.1},2,host-a,0,GPU-a0,999`, // conflicting duplicate: first wins
  `1,${START + 0.8},3,host-a,0,GPU-a0,500`, // same second: mean 400 W
  `1,${START + 1.1},4,host-a,0,GPU-a0,550`, // host-b dropout: null bucket
  `1,${START + 61},5,host-b,0,GPU-b0,90`, // inclusive padded boundary
  `1,${START + 62},6,host-b,0,GPU-b0,1`,
].join('\n');
const MANIFEST = {
  producer: 'srt-slurm.dcgm-power',
  expected_devices: [
    { hostname: 'host-a', gpu_index: 0, assignments: [{ worker_role: 'prefill' }] },
    { hostname: 'host-b', gpu_index: 0, assignments: [{ worker_role: 'decode' }] },
  ],
};
const VALIDATION = {
  selected_window: { start_time_unix: START, end_time_unix: START + 1 },
  benchmark_window: { start_time_unix: START - 100, end_time_unix: START + 100 },
};

function stamp(seconds: number): string {
  return new Date((seconds + 7200) * 1000)
    .toISOString()
    .replaceAll('-', '/')
    .replace('T', ' ')
    .replace('Z', '');
}

function client(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await database.query<Record<string, unknown>>(query, values);
      return result.rows;
    },
    { json: JSON.stringify, array: (value: unknown) => value },
  );
}

function writeArtifact(name: string, files: ReadonlyMap<string, string>) {
  const artifactDir = path.join(root, name);
  for (const [file, contents] of files) {
    const pathname = path.join(artifactDir, file);
    fs.mkdirSync(path.dirname(pathname), { recursive: true });
    fs.writeFileSync(pathname, contents);
  }
  return { artifactName: name, artifactDir };
}

function bundle(validation: Record<string, unknown> = VALIDATION) {
  return new Map([
    ['LOGS/power/samples.csv', CSV],
    ['LOGS/power/manifest.json', JSON.stringify(MANIFEST)],
    [SOURCE, JSON.stringify(validation)],
  ]);
}

function agentxBundle() {
  const files = bundle();
  files.delete(SOURCE);
  const resultPath = 'agentic/conc_32/agentic_power_concurrency_32.json';
  files.set(`${NAME.slice('power_audit_'.length)}_conc32.json`, JSON.stringify({ conc: 32 }));
  files.set(
    'LOGS/agentic/conc_32/power_validation.json',
    JSON.stringify({
      ...VALIDATION,
      power_valid: false,
      selected_window: {
        ...VALIDATION.selected_window,
        concurrency: 32,
        result_path: resultPath,
        window_file: 'windows/agentic_power_concurrency_32.json',
      },
    }),
  );
  files.set(
    'LOGS/power/windows/agentic_power_concurrency_32.json',
    JSON.stringify({
      concurrency: 32,
      result_path: resultPath,
      benchmark_start_time_unix: START,
      benchmark_end_time_unix: START + 1,
    }),
  );
  return files;
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-timeline-'));
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  }
  await db.exec('ALTER TABLE benchmark_results ADD COLUMN power_audit jsonb');
  readSql = client(db);
  sql = Object.assign(client(db), {
    begin: (fn: (tx: postgres.Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(client(tx) as unknown as postgres.Sql)),
  }) as unknown as postgres.Sql;
}, 20_000);

afterAll(async () => {
  await db?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, created_at, date)
      VALUES (1, ${RUN}, 1, 'Run Sweep', 'completed', '2026-09-12', '2026-09-12');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'qwen3.5', 'b200', 'sglang', 'fp8', 'none', false, 1, 1, 1, 1);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, metrics)
      VALUES (10, 1, 1, 'single_turn', '2026-09-12', 8192, 1024, 32, '{}'),
             (11, 1, 1, 'single_turn', '2026-09-12', 8192, 1024, 64, '{}');`);
});

describe('artifact → ingest → stored Timeline', () => {
  it.each(['explicit', 'wrong-run', 'wrong-id', 'wrong-conc', 'ambiguous'])(
    'does not infer or overwrite point provenance for %s identity',
    async (scenario) => {
      await db.exec("UPDATE benchmark_results SET benchmark_type = 'agentic_traces'");
      if (scenario === 'explicit')
        await db.exec(
          `UPDATE benchmark_results SET power_audit = '{"source":"existing.json"}' WHERE id = 10`,
        );
      if (scenario === 'wrong-run') {
        await db.exec(`INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, created_at, date)
          VALUES (2, 1, 1, 'Other run', 'completed', '2026-09-12', '2026-09-12');
          UPDATE benchmark_results SET workflow_run_id = 2 WHERE id = 10`);
      }
      if (scenario === 'wrong-conc')
        await db.exec('UPDATE benchmark_results SET conc = 31 WHERE id = 10');
      if (scenario === 'ambiguous')
        await db.exec('UPDATE benchmark_results SET conc = 32, isl = 1 WHERE id = 11');
      const before = await db.query('SELECT id, power_audit FROM benchmark_results ORDER BY id');
      await ingestGpuMetricsArtifact(sql, {
        workflowRunId: 1,
        artifact: writeArtifact(NAME, agentxBundle()),
        benchmarkResultIds: scenario === 'wrong-id' ? [11] : [10, 11],
      });
      const after = await db.query('SELECT id, power_audit FROM benchmark_results ORDER BY id');
      expect(after.rows).toEqual(before.rows);
    },
  );

  it('matches artifact windows, host/GPU identity, deduplicated mean watts and gaps for a multinode bundle', async () => {
    const files = bundle();
    const artifact = writeArtifact(NAME, files);
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10, 11],
    });
    // Remove the actual artifact before querying: only the DB survives.
    fs.rmSync(artifact.artifactDir, { recursive: true });
    const stored = await getGpuMetricsForRun(readSql, RUN);
    const actual = storedPowerSeries(stored!.series);
    expect(actual).toEqual(cutPowerAuditBundle(NAME, files));
    expect(actual[0]).toMatchObject({
      artifact: NAME,
      source: SOURCE,
      startMs: (START - 60) * 1000,
      t: [0, 60, 61, 121],
      power: [
        [0, 400, 550, null],
        [null, 450, null, 90],
      ],
      devices: [
        { id: 'host-a/GPU-a0', role: 'prefill' },
        { id: 'host-b/GPU-b0', role: 'decode' },
      ],
    });
    const point = await getGpuMetricsForPoint(readSql, 10);
    expect(point!.series.map((series) => series.benchmarkResultIds)).toEqual([
      [10, 11],
      [10, 11],
    ]);
    expect(storedPowerSeries(point!.series)).toEqual(actual);
  });

  it('retains selected-window precedence and validation role overrides across ingestion', async () => {
    const files = bundle({
      ...VALIDATION,
      per_gpu_role: { 'host-a/GPU-a0': 'decode', 'host-b/GPU-b0': 'prefill' },
    });
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writeArtifact(NAME, files),
      benchmarkResultIds: [10],
    });
    const stored = await getGpuMetricsForRun(readSql, RUN);
    const actual = storedPowerSeries(stored!.series);
    expect(actual).toEqual(cutPowerAuditBundle(NAME, files));
    expect(actual[0].devices?.[0]).toEqual({ id: 'host-b/GPU-b0', role: 'prefill' });
  });

  it('keeps SMI telemetry embedded in a power_audit bundle readable with the same source/window cuts', async () => {
    const files = bundle();
    files.set(
      'gpu_metrics.csv',
      [
        'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
        `${stamp(START - 61)}, 0, 1 W, 60, 1000 MHz, 2000 MHz, 80 %, 70 %`,
        `${stamp(START)}, 0, 300 W, 60, 1000 MHz, 2000 MHz, 80 %, 70 %`,
        `${stamp(START)}, 1, 500 W, 60, 1000 MHz, 2000 MHz, 80 %, 70 %`,
        `${stamp(START + 1)}, 0, 700 W, 60, 1000 MHz, 2000 MHz, 80 %, 70 %`,
      ].join('\n'),
    );
    files.set('gpu_metrics_identity.csv', 'index, uuid\n0, GPU-a\n1, GPU-b');
    files.set(
      'benchmark_gpu_metrics_context.json',
      JSON.stringify({ timestamp_timezone: '+02:00' }),
    );
    const artifact = writeArtifact(NAME, files);
    await ingestGpuMetricsArtifact(sql, { workflowRunId: 1, artifact, benchmarkResultIds: [10] });
    fs.rmSync(artifact.artifactDir, { recursive: true });
    const stored = await getGpuMetricsForRun(readSql, RUN);
    expect(stored!.series).toHaveLength(1);
    expect(stored!.series[0].fileName).toBe('gpu_metrics.csv');
    const actual = storedPowerSeries(stored!.series);
    expect(actual).toEqual(cutPowerAuditBundle(NAME, files));
    expect(actual).toMatchObject([
      {
        source: SOURCE,
        startMs: START * 1000,
        gpus: [0, 1],
        power: [
          [300, 700],
          [500, null],
        ],
        devices: [{ id: '0' }, { id: '1' }],
      },
    ]);
  });

  it('rejects incomplete per-host commits using the artifact inventory and legacy manifest', async () => {
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writeArtifact(NAME, bundle()),
      benchmarkResultIds: [10],
    });
    await sql`DELETE FROM gpu_metric_series WHERE file_name = 'LOGS/power/samples.csv#host-b'`;
    const stored = await getGpuMetricsForRun(readSql, RUN);
    expect(stored!.series).toHaveLength(1);
    expect(() => storedPowerSeries(stored!.series)).toThrow(
      'stored file/sample coverage is incomplete',
    );
    await sql`UPDATE gpu_metric_series SET sidecars = sidecars - 'seriesInventory'`;
    const legacy = await getGpuMetricsForRun(readSql, RUN);
    expect(() => storedPowerSeries(legacy!.series)).toThrow(
      'expected device host-b GPU 0 is not stored',
    );
  });
});
