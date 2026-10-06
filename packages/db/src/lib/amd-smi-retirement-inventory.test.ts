import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  classifyDatabaseRow,
  summarizeDatabaseInventory,
  verifySourceEvidence,
  type DatabasePowerRow,
} from './amd-smi-retirement-inventory';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function evidence(csv: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amd-smi-retirement-'));
  roots.push(root);
  const relative = '36507377618/11018065123/gpu_metrics.csv';
  const csvPath = path.join(root, relative);
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csv);
  return {
    root,
    point: {
      result_id: '443533',
      collector_metric: 'socket_power',
      collector_command: 'amd-smi metric -p -c -t -u -w 1 --csv',
      csv_relative_path: relative,
      csv_sha256: createHash('sha256').update(csv).digest('hex'),
      api_snapshot_row: {
        hardware: 'mi355x',
        run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/36507377618/attempts/1',
      },
      source_run: {
        id: 36507377618,
        run_attempt: 1,
        head_sha: 'b9489aead453ae3765bf5882db84031326bf1ff7',
      },
    },
  };
}

it('selects only an exact direct AMD-SMI source and leaves benchmark metrics untouched', () => {
  const { root, point } = evidence('timestamp,gpu,socket_power\n1,0,535\n');
  const source = verifySourceEvidence(point, root);
  const row: DatabasePowerRow = {
    resultId: '443533',
    githubRunId: 36507377618,
    runAttempt: 1,
    headSha: source.sourceSha,
    hardware: 'mi355x',
    model: 'qwen3.5',
    framework: 'sglang',
    isMultinode: false,
    benchmarkType: 'single_turn',
    runName: 'benchmark',
    metrics: {
      avg_power_w: 535,
      total_gpu_energy_j: 1200,
      prefill_joules_per_input_token: 1.5,
      decode_joules_per_output_token: 2.5,
      avg_cpu_socket_power_w: 250,
      power_valid: 1,
      power_metric_schema_version: 2,
      mean_ttft: 0.2,
    },
    hasWorkers: false,
    linkedSeries: [
      { id: '42', vendor: 'amd', artifactName: 'gpu_metrics_config', csvSha256: source.csvSha256 },
    ],
  };
  const metricsBefore = { ...row.metrics };
  expect(classifyDatabaseRow(row, [source])).toMatchObject({
    status: 'verified_legacy_amd_smi',
    powerVerdict: 'valid',
    powerKeys: [
      'avg_power_w',
      'total_gpu_energy_j',
      'prefill_joules_per_input_token',
      'decode_joules_per_output_token',
    ],
    linkedSeriesIds: ['42'],
  });
  expect(row.metrics).toEqual(metricsBefore);
  expect(
    classifyDatabaseRow({ ...row, metrics: { avg_power_w: null, power_valid: 0 } }, [])
      .finitePowerKeys,
  ).toEqual([]);
  expect(
    classifyDatabaseRow({ ...row, metrics: { avg_power_w: null, power_valid: 0 } }, [])
      .powerVerdict,
  ).toBe('invalid');
  expect(classifyDatabaseRow(row, [source]).powerKeys).not.toContain('avg_cpu_socket_power_w');
  expect(classifyDatabaseRow(row, [source]).powerKeys).not.toContain('power_valid');
  expect(classifyDatabaseRow(row, [source]).powerKeys).not.toContain('power_metric_schema_version');
  expect(classifyDatabaseRow(row, [source]).powerKeys).not.toContain('mean_ttft');
  expect(classifyDatabaseRow({ ...row, runAttempt: 2 }, [source]).status).toBe('identity_mismatch');
  expect(
    classifyDatabaseRow(
      { ...row, linkedSeries: [{ ...row.linkedSeries[0]!, csvSha256: 'different' }] },
      [source],
    ).status,
  ).toBe('series_sha_mismatch');
});

it('rejects a DME CSV and a changed source hash even with an AMD-SMI label', () => {
  const { root, point } = evidence(
    'schema_version,timestamp_unix,hostname,gpu_index,power_w\n2,1,amd-a,0,535\n',
  );
  expect(() => verifySourceEvidence(point, root)).toThrow('not direct AMD-SMI');
  fs.writeFileSync(path.join(root, point.csv_relative_path), 'timestamp,gpu,socket_power\n1,0,1\n');
  expect(() => verifySourceEvidence(point, root)).toThrow('CSV SHA mismatch');
});

it('inventories legacy power before telemetry tables exist without claiming complete coverage', () => {
  const { root, point } = evidence('timestamp,gpu,socket_power\n1,0,535\n');
  const source = verifySourceEvidence(point, root);
  const rows: DatabasePowerRow[] = [
    {
      resultId: source.resultId,
      githubRunId: source.githubRunId,
      runAttempt: source.runAttempt,
      headSha: source.sourceSha,
      hardware: source.hardware,
      model: 'qwen3.5',
      framework: 'sglang',
      isMultinode: false,
      benchmarkType: 'single_turn',
      runName: 'benchmark',
      metrics: { avg_power_w: 535, median_ttft: 0.2 },
      hasWorkers: false,
      linkedSeries: [],
    },
  ];
  const inventory = summarizeDatabaseInventory(rows, [source], false);
  expect(inventory).toMatchObject({
    amdRowsRead: 1,
    powerOrTelemetryRows: 1,
    telemetryInventory: 'unknown_pre_gpu_metrics_migration',
    completeSourceCoverage: false,
    verifiedRetirementCandidates: [
      { resultId: source.resultId, powerKeys: ['avg_power_w'], seriesCoverage: 'unknown' },
    ],
  });
  expect(rows[0]?.metrics).toEqual({ avg_power_w: 535, median_ttft: 0.2 });
});
