/** Exact raw-verified AMD-SMI sources retired from accepted GPU power. */
import { createHash } from 'node:crypto';

import { configCacheKey, type ConfigParams } from '../etl/config-cache';
import { LEGACY_GPU_POWER_KEYS } from './amd-smi-retirement-inventory';
import rawPoints from './legacy-amd-smi-raw-points.json';

export interface LegacyRunIdentity {
  githubRunId: number;
  runAttempt: number | null | undefined;
  headSha?: string | null;
}

export interface LegacyPointIdentity {
  config: ConfigParams;
  benchmarkType: string;
  isl: number | null;
  osl: number | null;
  conc: number;
  offloadMode: string;
  recipeFingerprint?: string | null;
}

export const LEGACY_AMD_SMI_RESULT_IDS = rawPoints.entries.map((entry) => Number(entry.resultId));
export const LEGACY_AMD_SMI_RUN_IDS = [
  ...new Set(rawPoints.entries.map((entry) => entry.githubRunId)),
];

function exactRun(run: LegacyRunIdentity, entry: LegacyRunIdentity): boolean {
  return (
    run.githubRunId === entry.githubRunId &&
    run.runAttempt === entry.runAttempt &&
    run.headSha === entry.headSha
  );
}

function samePoint(point: LegacyPointIdentity, entry: (typeof rawPoints.entries)[number]): boolean {
  return (
    configCacheKey(point.config) === configCacheKey(entry.config as ConfigParams) &&
    point.benchmarkType === entry.benchmarkType &&
    point.isl === entry.isl &&
    point.osl === entry.osl &&
    point.conc === entry.conc &&
    point.offloadMode === entry.offloadMode &&
    (point.recipeFingerprint ?? null) === entry.recipeFingerprint
  );
}

/** A raw-verified point requires a portable full config and benchmark identity. */
export function rawPointRetires(run: LegacyRunIdentity, point: LegacyPointIdentity): boolean {
  return rawPoints.entries.some((entry) => exactRun(run, entry) && samePoint(point, entry));
}

function unresolvedRawPoint(run: LegacyRunIdentity, point: LegacyPointIdentity): boolean {
  if (run.headSha && run.runAttempt && run.runAttempt > 0) return false;
  return rawPoints.entries.some(
    (entry) =>
      run.githubRunId === entry.githubRunId &&
      (!run.headSha || run.headSha === entry.headSha) &&
      (!run.runAttempt || run.runAttempt === entry.runAttempt) &&
      samePoint(point, entry),
  );
}

export function retiredPowerSource(
  run: LegacyRunIdentity,
  point: LegacyPointIdentity,
): 'verified_raw_csv' | null {
  return rawPointRetires(run, point) ? 'verified_raw_csv' : null;
}

/** Preserve performance, CPU power, schema/verdict/audit metadata and raw artifacts. */
export function withoutRetiredGpuPower<
  T extends LegacyPointIdentity & {
    metrics: Record<string, unknown>;
    workers?: unknown;
  },
>(run: LegacyRunIdentity, point: T, withholdWhenSourceUnknown = false): T {
  if (
    !retiredPowerSource(run, point) &&
    !(withholdWhenSourceUnknown && unresolvedRawPoint(run, point))
  )
    return point;
  const metrics = { ...point.metrics };
  for (const key of LEGACY_GPU_POWER_KEYS) delete metrics[key];
  const workers = Array.isArray(point.workers)
    ? point.workers.map((worker: unknown) => {
        if (typeof worker !== 'object' || worker === null || Array.isArray(worker)) return worker;
        const retained = { ...worker } as Record<string, unknown>;
        for (const key of LEGACY_GPU_POWER_KEYS) delete retained[key];
        return retained;
      })
    : point.workers;
  return { ...point, metrics, ...(point.workers === undefined ? {} : { workers }) } as T;
}

function csvDigest(csv: Buffer): string {
  return createHash('sha256').update(csv).digest('hex');
}

/** Exact retained CSV bytes independently identify the two retired series. */
export function isRetiredRawCsv(run: LegacyRunIdentity, csv: Buffer): boolean {
  const digest = csvDigest(csv);
  return rawPoints.entries.some((entry) => exactRun(run, entry) && entry.csvSha256 === digest);
}

/** Match exact CSV bytes; a known attempt/head must also agree with the audited source. */
export function isRetiredStoredSeries(
  run: LegacyRunIdentity,
  vendor: string,
  csvSha256: string,
): boolean {
  return (
    vendor === 'amd' &&
    rawPoints.entries.some(
      (entry) =>
        run.githubRunId === entry.githubRunId &&
        (!run.headSha || run.headSha === entry.headSha) &&
        (!run.runAttempt || run.runAttempt === entry.runAttempt) &&
        entry.csvSha256 === csvSha256,
    )
  );
}

/** GitHub lists artifacts across attempts, so require both source run/head and CSV bytes. */
export function isRetiredLiveCsv(
  githubRunId: number,
  headSha: string | null,
  csv: Buffer,
): boolean {
  const digest = csvDigest(csv);
  return rawPoints.entries.some(
    (entry) =>
      entry.githubRunId === githubRunId &&
      (!headSha || entry.headSha === headSha) &&
      entry.csvSha256 === digest,
  );
}
