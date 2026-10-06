import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CPU_SIDE_POWER_METRIC_KEYS,
  HW_REGISTRY,
  MEASURED_POWER_METRIC_KEYS,
} from '@semianalysisai/inferencex-constants';

export const AMD_HARDWARE = Object.entries(HW_REGISTRY)
  .filter(([, gpu]) => gpu.vendor === 'AMD')
  .map(([hardware]) => hardware);

export const LEGACY_GPU_POWER_KEYS = [...MEASURED_POWER_METRIC_KEYS].filter(
  (key) =>
    !CPU_SIDE_POWER_METRIC_KEYS.has(key) &&
    (key.endsWith('_power_w') || key.endsWith('_energy_j') || key.includes('joules_per_')),
);

export interface SourceEvidence {
  resultId: string;
  githubRunId: number;
  runAttempt: number;
  hardware: string;
  sourceSha: string;
  csvSha256: string;
  csvPath: string;
  collectorMetric: 'socket_power';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Verify one exact direct AMD-SMI artifact before proposing any DB row. */
export function verifySourceEvidence(point: unknown, artifactRoot: string): SourceEvidence {
  if (!isRecord(point)) throw new Error('Malformed source point');
  const run = isRecord(point.source_run) ? point.source_run : null;
  const row = isRecord(point.api_snapshot_row) ? point.api_snapshot_row : null;
  if (
    typeof point.result_id !== 'string' ||
    !/^\d+$/u.test(point.result_id) ||
    typeof run?.id !== 'number' ||
    !Number.isSafeInteger(run.id) ||
    typeof run.run_attempt !== 'number' ||
    !Number.isSafeInteger(run.run_attempt) ||
    typeof run.head_sha !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(run.head_sha) ||
    typeof row?.hardware !== 'string' ||
    !AMD_HARDWARE.includes(row.hardware) ||
    row.run_url !==
      `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run.id}/attempts/${run.run_attempt}` ||
    point.collector_metric !== 'socket_power' ||
    typeof point.collector_command !== 'string' ||
    !/^amd-smi metric(?:\s|$)/u.test(point.collector_command) ||
    typeof point.csv_relative_path !== 'string' ||
    typeof point.csv_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(point.csv_sha256)
  ) {
    throw new Error(
      `Incomplete direct AMD-SMI source identity for result ${String(point.result_id)}`,
    );
  }
  const root = path.resolve(artifactRoot);
  const csvPath = path.resolve(root, point.csv_relative_path);
  if (!csvPath.startsWith(`${root}${path.sep}`) || path.basename(csvPath) !== 'gpu_metrics.csv') {
    throw new Error(`Unexpected CSV path for result ${point.result_id}`);
  }
  const csv = fs.readFileSync(csvPath);
  if (sha256(csv) !== point.csv_sha256) {
    throw new Error(`CSV SHA mismatch for result ${point.result_id}`);
  }
  const header = csv.toString('utf8', 0, Math.min(csv.length, 4096)).split(/\r?\n/u, 1)[0] ?? '';
  const columns = new Set(header.split(',').map((name) => name.trim().toLowerCase()));
  if (!['timestamp', 'gpu', 'socket_power'].every((name) => columns.has(name))) {
    throw new Error(`CSV is not direct AMD-SMI socket_power for result ${point.result_id}`);
  }
  return {
    resultId: point.result_id,
    githubRunId: run.id,
    runAttempt: run.run_attempt,
    hardware: row.hardware,
    sourceSha: run.head_sha,
    csvSha256: point.csv_sha256,
    csvPath: point.csv_relative_path,
    collectorMetric: 'socket_power',
  };
}

export function readSourceEvidence(evidencePath: string, artifactRoot: string): SourceEvidence[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  if (!isRecord(parsed) || !Array.isArray(parsed.source_identified_points)) {
    throw new Error('Expected source_identified_points array');
  }
  return parsed.source_identified_points.map((point: unknown) =>
    verifySourceEvidence(point, artifactRoot),
  );
}

export interface DatabasePowerRow {
  resultId: string;
  githubRunId: number;
  runAttempt: number;
  headSha: string;
  hardware: string;
  model: string;
  framework: string;
  isMultinode: boolean;
  benchmarkType: string;
  runName: string;
  metrics: Record<string, unknown>;
  hasWorkers: boolean;
  linkedSeries: { id: string; vendor: string; artifactName: string; csvSha256: string }[];
}

export function summarizeDatabaseInventory(
  rows: readonly DatabasePowerRow[],
  sources: readonly SourceEvidence[],
  telemetryTablesPresent: boolean,
  amdRowsRead = rows.length,
) {
  const inventory = rows.map((row) => ({
    resultId: row.resultId,
    githubRunId: row.githubRunId,
    runAttempt: row.runAttempt,
    headSha: row.headSha,
    hardware: row.hardware,
    model: row.model,
    framework: row.framework,
    isMultinode: row.isMultinode,
    benchmarkType: row.benchmarkType,
    runName: row.runName,
    hasWorkers: row.hasWorkers,
    linkedSeries: row.linkedSeries,
    ...classifyDatabaseRow(row, sources),
  }));
  const relevant = inventory.filter(
    (row) => row.powerKeys.length > 0 || row.linkedSeries.length > 0,
  );
  return {
    databaseChecked: true,
    amdRowsRead,
    powerOrTelemetryRows: relevant.length,
    telemetryInventory: telemetryTablesPresent ? 'available' : 'unknown_pre_gpu_metrics_migration',
    verifiedRetirementCandidates: relevant.filter(
      (row) => row.status === 'verified_legacy_amd_smi',
    ),
    unresolvedRows: relevant.filter((row) => row.status !== 'verified_legacy_amd_smi'),
    completeSourceCoverage:
      telemetryTablesPresent && relevant.every((row) => row.status === 'verified_legacy_amd_smi'),
  };
}

/** An exact result/run/attempt/source match is required; missing source stays unknown. */
export function classifyDatabaseRow(row: DatabasePowerRow, sources: readonly SourceEvidence[]) {
  const source = sources.find((entry) => entry.resultId === row.resultId);
  const powerKeys = LEGACY_GPU_POWER_KEYS.filter((key) => row.metrics[key] !== undefined);
  const finitePowerKeys = powerKeys.filter(
    (key) =>
      typeof row.metrics[key] === 'number' &&
      Number.isFinite(row.metrics[key]) &&
      row.metrics[key] >= 0,
  );
  const powerVerdict =
    row.metrics.power_valid === 1 ? 'valid' : row.metrics.power_valid === 0 ? 'invalid' : 'unknown';
  const measurement = { powerKeys, finitePowerKeys, powerVerdict };
  if (!source) return { status: 'source_unknown' as const, ...measurement };
  if (
    row.githubRunId !== source.githubRunId ||
    row.runAttempt !== source.runAttempt ||
    row.headSha !== source.sourceSha ||
    row.hardware !== source.hardware
  ) {
    return { status: 'identity_mismatch' as const, ...measurement };
  }
  const linked = row.linkedSeries.filter((series) => series.csvSha256 === source.csvSha256);
  if (row.linkedSeries.length > 0 && linked.length === 0) {
    return { status: 'series_sha_mismatch' as const, ...measurement };
  }
  return {
    status: 'verified_legacy_amd_smi' as const,
    ...measurement,
    linkedSeriesIds: linked.map((series) => series.id),
    seriesCoverage: row.linkedSeries.length === 0 ? ('unknown' as const) : ('matched' as const),
    source,
  };
}
