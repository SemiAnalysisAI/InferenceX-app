import { isDeepStrictEqual } from 'node:util';
import { MEASURED_POWER_METRIC_KEYS } from '@semianalysisai/inferencex-constants';
import type { BenchmarkParams } from './benchmark-mapper';

const CONFIG_FIELDS = {
  hardware: 'hardware',
  framework: 'framework',
  model: 'model',
  precision: 'precision',
  specMethod: 'spec_method',
  disagg: 'disagg',
  isMultinode: 'is_multinode',
  prefillTp: 'prefill_tp',
  prefillEp: 'prefill_ep',
  prefillDpAttn: 'prefill_dp_attention',
  prefillNumWorkers: 'prefill_num_workers',
  decodeTp: 'decode_tp',
  decodeEp: 'decode_ep',
  decodeDpAttn: 'decode_dp_attention',
  decodeNumWorkers: 'decode_num_workers',
  numPrefillGpu: 'num_prefill_gpu',
  numDecodeGpu: 'num_decode_gpu',
} as const;
const IDENTITY_FIELDS = [
  ...Object.values(CONFIG_FIELDS),
  'benchmark_type',
  'isl',
  'osl',
  'conc',
  'offload_mode',
  'recipe_fingerprint',
  'image',
  'run_url',
] as const;
const POWER_FIELDS = [...MEASURED_POWER_METRIC_KEYS, 'power_valid', 'power_metric_schema_version'];
export interface PowerPublicationPoint {
  identity: Record<string, unknown>;
  metrics: Record<string, number>;
  workers: unknown;
  power_invalid_reasons: unknown;
  power_audit: unknown;
  artifact: { path: string; sha256: string };
}
export interface PowerPublicationManifest {
  version: 1;
  runId: number;
  runAttempt: number;
  points: PowerPublicationPoint[];
  ingestErrors?: string[];
}
export interface PublishedPowerRow extends Record<string, unknown> {
  metrics: Record<string, number>;
}

export function publicationIdentity(row: Record<string, unknown>): string {
  return JSON.stringify(IDENTITY_FIELDS.map((key) => row[key] ?? null));
}

export function powerPublicationPoint(
  row: BenchmarkParams,
  runUrl: string,
  artifact: PowerPublicationPoint['artifact'],
): PowerPublicationPoint | null {
  if (row.benchmarkType !== 'single_turn' || row.isl !== 8192 || row.osl !== 1024) return null;
  const identity: Record<string, unknown> = Object.fromEntries(
    Object.entries(CONFIG_FIELDS).map(([source, target]) => [
      target,
      row.config[source as keyof typeof CONFIG_FIELDS],
    ]),
  );
  Object.assign(identity, {
    benchmark_type: row.benchmarkType,
    isl: row.isl,
    osl: row.osl,
    conc: row.conc,
    offload_mode: row.offloadMode,
    recipe_fingerprint: row.recipeFingerprint,
    image: row.image,
    run_url: runUrl,
  });
  return {
    identity,
    metrics: Object.fromEntries(
      POWER_FIELDS.filter((key) => Object.hasOwn(row.metrics, key)).map((key) => [
        key,
        row.metrics[key],
      ]),
    ),
    workers: row.workers ?? null,
    power_invalid_reasons: row.powerInvalidReasons ?? null,
    power_audit: row.powerAudit ?? null,
    artifact,
  };
}

/** Matching numbers alone would miss leaked invalid telemetry or lost audit evidence. */
export function verifyPowerPublication(
  expected: readonly PowerPublicationPoint[],
  actual: readonly PublishedPowerRow[],
  source: string,
): string[] {
  const byIdentity = new Map<string, PublishedPowerRow[]>();
  for (const row of actual) {
    const key = publicationIdentity(row);
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), row]);
  }
  const errors: string[] = [];
  for (const point of expected) {
    const rows = byIdentity.get(publicationIdentity(point.identity)) ?? [];
    const label = `${source}: ${point.identity.hardware}/${point.identity.model} conc=${point.identity.conc} (${point.artifact.path})`;
    if (rows.length !== 1) {
      errors.push(`${label}: expected one exact source point, found ${rows.length}`);
      continue;
    }
    const row = rows[0];
    for (const key of POWER_FIELDS) {
      if (!Object.is(point.metrics[key], row.metrics[key]))
        errors.push(
          `${label}: ${key} expected ${point.metrics[key] ?? 'absent'}, got ${row.metrics[key] ?? 'absent'}`,
        );
    }
    for (const key of ['workers', 'power_invalid_reasons', 'power_audit'] as const) {
      if (!isDeepStrictEqual(point[key], row[key] ?? null)) errors.push(`${label}: ${key} differs`);
    }
  }
  return errors;
}
