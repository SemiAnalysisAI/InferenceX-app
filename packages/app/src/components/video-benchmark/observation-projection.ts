import { at, type Bundle } from './bundle';
import type {
  VideoDeploymentFields,
  VideoDeploymentRecord,
  VideoHardwareHealth,
} from './deployment-contract';
import {
  QUALITY_METRIC_IDS,
  QUALITY_SCALE,
  type VideoQualityAssessment,
  type VideoQualityMetricResult,
} from './quality';
import type { ServingCell } from './serving';

export const DASHBOARD_OBSERVATIONS_PATH = 'dashboard-observations.json';
export interface VideoObservationFields extends Required<VideoDeploymentFields> {
  quality: VideoQualityAssessment | null;
}
const invalid = (detail: string): never => {
  throw new Error(`Invalid dashboard observation: ${detail}`);
};
function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid('expected object');
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some((key) => !keys.includes(key)))
    return invalid('unknown field');
  return result;
}
function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim())
    return invalid('expected nonempty string or null');
  return value;
}
function nullableHash(value: unknown): string | null {
  const hash = nullableText(value);
  if (hash !== null && !/^[a-f0-9]{64}$/u.test(hash)) return invalid('expected SHA256 or null');
  return hash;
}
function numeric(
  value: unknown,
  minimum: number,
  integer = false,
  maximum = Infinity,
): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isSafeInteger(value))
  )
    return invalid('invalid numeric field');
  return value;
}
function boolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'boolean') return invalid('expected boolean or null');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T))
    return invalid('unsupported value');
  return value as T;
}
function deployment(value: unknown): VideoDeploymentRecord | null {
  if (value === null || value === undefined) return null;
  const d = object(value, [
    'gpusPerReplica',
    'ring',
    'cfg',
    'offload',
    'encoderParallel',
    'batchSize',
    'maxBatchSize',
    'batchDelayMs',
    'scheduling',
    'engine',
    'precision',
    'acceleration',
    'generationKey',
    'configEvidence',
  ]);
  const offload =
    d.offload === null || d.offload === undefined
      ? null
      : object(d.offload, [
          'ditCpu',
          'ditLayerwise',
          'textEncoderCpu',
          'imageEncoderCpu',
          'vaeCpu',
        ]);
  return {
    gpusPerReplica: numeric(d.gpusPerReplica, 1, true),
    ring: numeric(d.ring, 1, true),
    cfg: numeric(d.cfg, 1, true),
    batchSize: numeric(d.batchSize, 1, true),
    maxBatchSize: numeric(d.maxBatchSize, 1, true),
    batchDelayMs: numeric(d.batchDelayMs, 0),
    offload: offload
      ? {
          ditCpu: boolean(offload.ditCpu),
          ditLayerwise: boolean(offload.ditLayerwise),
          textEncoderCpu: boolean(offload.textEncoderCpu),
          imageEncoderCpu: boolean(offload.imageEncoderCpu),
          vaeCpu: boolean(offload.vaeCpu),
        }
      : null,
    encoderParallel: nullableText(d.encoderParallel),
    scheduling: nullableText(d.scheduling),
    engine: nullableText(d.engine),
    precision: nullableText(d.precision),
    acceleration: nullableText(d.acceleration),
    generationKey: nullableText(d.generationKey),
    configEvidence: nullableText(d.configEvidence),
  };
}
function health(value: unknown): VideoHardwareHealth | null {
  if (value === null || value === undefined) return null;
  const h = object(value, ['status', 'reason', 'evidence']);
  return {
    status: choice(h.status, ['pass', 'fail', 'unknown']),
    reason: nullableText(h.reason),
    evidence: nullableText(h.evidence),
  };
}
function qualityMetric(value: unknown): VideoQualityMetricResult {
  const q = object(value, [
    'value',
    'status',
    'direction',
    'evaluatorId',
    'evaluatorVersion',
    'evaluatorSha256',
    'samples',
    'total',
    'calibration',
  ]);
  const c =
    q.calibration === null || q.calibration === undefined
      ? null
      : object(q.calibration, ['status', 'cohortId', 'threshold', 'provenance', 'frozenAt']);
  const frozenAt = c ? nullableText(c.frozenAt) : null;
  if (frozenAt !== null && !Number.isFinite(Date.parse(frozenAt)))
    return invalid('invalid calibration date');
  return {
    value: numeric(q.value, QUALITY_SCALE.minimum, false, QUALITY_SCALE.maximum),
    status: choice(q.status, [
      'unjudged',
      'judged_unqualified',
      'pass',
      'fail',
      'inconclusive',
      'unassessable',
    ]),
    direction: choice(q.direction, ['higher', 'lower']),
    evaluatorId: nullableText(q.evaluatorId),
    evaluatorVersion: nullableText(q.evaluatorVersion),
    evaluatorSha256: nullableHash(q.evaluatorSha256),
    samples: numeric(q.samples, 0, true),
    total: numeric(q.total, 0, true),
    calibration: c
      ? {
          status: choice(c.status, ['uncalibrated', 'calibrated']),
          cohortId: nullableText(c.cohortId),
          threshold: numeric(c.threshold, QUALITY_SCALE.minimum, false, QUALITY_SCALE.maximum),
          provenance: nullableText(c.provenance),
          frozenAt,
        }
      : null,
  };
}
function quality(value: unknown): VideoQualityAssessment | null {
  if (value === null || value === undefined) return null;
  const q = object(value, [
    'scale',
    'contractId',
    'contractSha256',
    'rubricVersion',
    'rubricSha256',
    'metrics',
  ]);
  const metrics = object(q.metrics, QUALITY_METRIC_IDS);
  return {
    scale: choice(q.scale, [QUALITY_SCALE.unit]),
    contractId: nullableText(q.contractId),
    contractSha256: nullableHash(q.contractSha256),
    rubricVersion: nullableText(q.rubricVersion),
    rubricSha256: nullableHash(q.rubricSha256),
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([key, result]) => [key, qualityMetric(result)]),
    ),
  };
}

/** Validate curator projections too; validation does not turn them into sealed producer evidence. */
export function parseVideoObservationFields(value: unknown): VideoObservationFields {
  const fields = object(value, ['deployment', 'hardwareHealth', 'quality']);
  return {
    deployment: deployment(fields.deployment),
    hardwareHealth: health(fields.hardwareHealth),
    quality: quality(fields.quality),
  };
}

/**
 * Optional additive v1 sidecar. Raw bytes are checked by readVerifiedFiles on ingest;
 * retained StoredArtifact projections preserve those seals and are a trusted transport.
 * Reject a mismatched sidecar before publishing any source observations.
 */
export function sourceObservationFields(
  bundle: Pick<Bundle, 'manifest' | 'documents' | 'checksums'>,
  cells: ServingCell[],
): Map<string, VideoObservationFields> {
  const path = DASHBOARD_OBSERVATIONS_PATH;
  const document = bundle.documents.get(path);
  const manifestHash = at(bundle.manifest, 'evidence', path);
  if (document === undefined) {
    if (bundle.checksums.has(path) || manifestHash !== null) return invalid('sidecar missing');
    return new Map();
  }
  const seal = nullableHash(bundle.checksums.get(path));
  if (!seal || seal !== manifestHash) return invalid('sidecar is not bound to manifest');
  const sidecar = object(document, ['schemaVersion', 'sourceRunId', 'sourceSha', 'cells']);
  if (
    sidecar.schemaVersion !== 1 ||
    sidecar.sourceRunId !== at(bundle.manifest, 'run_id') ||
    sidecar.sourceSha !== at(bundle.manifest, 'git_commit')
  )
    return invalid('source identity mismatch');
  const records = object(sidecar.cells);
  if (Object.keys(records).length === 0) return invalid('empty cells');
  return new Map(
    Object.entries(records).map(([id, value]) => {
      const cell = cells.find((candidate) => candidate.id === id);
      const row = object(value, [
        'runSha256',
        'specSha256',
        'deployment',
        'hardwareHealth',
        'quality',
      ]);
      if (
        !cell ||
        !cell.run ||
        !cell.spec ||
        !nullableHash(row.runSha256) ||
        !nullableHash(row.specSha256) ||
        row.runSha256 !== bundle.checksums.get(cell.runPath) ||
        row.specSha256 !== bundle.checksums.get(cell.specPath)
      )
        return invalid('cell run/spec identity mismatch');
      return [
        id,
        parseVideoObservationFields({
          deployment: row.deployment,
          hardwareHealth: row.hardwareHealth,
          quality: row.quality,
        }),
      ];
    }),
  );
}
