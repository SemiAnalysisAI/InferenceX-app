import { QUALITY_METRIC_IDS, QUALITY_SCALE } from '@/components/video-benchmark/quality';
import type { ApiSchema } from '@/lib/api/api-documentation';

const nullableText: ApiSchema = { type: ['string', 'null'] };
const nullableHash: ApiSchema = { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' };
const nullableScore: ApiSchema = {
  type: ['number', 'null'],
  minimum: QUALITY_SCALE.minimum,
  maximum: QUALITY_SCALE.maximum,
};

const qualityMetric: ApiSchema = {
  type: 'object',
  properties: {
    value: nullableScore,
    status: {
      type: 'string',
      enum: ['unjudged', 'judged_unqualified', 'pass', 'fail', 'inconclusive', 'unassessable'],
    },
    direction: { type: 'string', enum: ['higher', 'lower'] },
    evaluatorId: nullableText,
    evaluatorVersion: nullableText,
    evaluatorSha256: nullableHash,
    samples: { type: ['integer', 'null'], minimum: 0 },
    total: { type: ['integer', 'null'], minimum: 0 },
    calibration: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'string', enum: ['uncalibrated', 'calibrated'] },
        cohortId: nullableText,
        threshold: nullableScore,
        provenance: nullableText,
        frozenAt: nullableText,
      },
      required: ['status', 'cohortId', 'threshold', 'provenance', 'frozenAt'],
      additionalProperties: false,
    },
  },
  required: [
    'value',
    'status',
    'direction',
    'evaluatorId',
    'evaluatorVersion',
    'evaluatorSha256',
    'samples',
    'total',
    'calibration',
  ],
  additionalProperties: false,
};

/** Raw judgments stay distinct from the plot's calibrated eligibility and derived quality value. */
export const videoQualitySchema: ApiSchema = {
  type: ['object', 'null'],
  description:
    'Seven original H3 rubric dimensions on an explicit 0–4 scale; null means unjudged. All critical dimensions require complete coverage and calibrated frozen rules before frontier admission.',
  properties: {
    scale: { type: 'string', enum: [QUALITY_SCALE.unit] },
    contractId: nullableText,
    contractSha256: nullableHash,
    rubricVersion: nullableText,
    rubricSha256: nullableHash,
    metrics: {
      type: 'object',
      properties: Object.fromEntries(QUALITY_METRIC_IDS.map((id) => [id, qualityMetric])),
      additionalProperties: false,
    },
  },
  required: ['scale', 'contractId', 'contractSha256', 'rubricVersion', 'rubricSha256', 'metrics'],
  additionalProperties: false,
};

export const videoProducerSchema: ApiSchema = {
  type: ['object', 'null'],
  description:
    'Producer-sealed model revision, selected plan SHA-256 and engine revision; null for legacy sources without that identity. This is independent of quality qualification.',
  properties: {
    modelRevision: { type: 'string', pattern: '^[a-f0-9]{40}$' },
    planSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    engine: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: ['sglang', 'vllm-omni'] },
        revision: { type: 'string', pattern: '^[a-f0-9]{40}$' },
      },
      required: ['name', 'revision'],
      additionalProperties: false,
    },
  },
  required: ['modelRevision', 'planSha256', 'engine'],
  additionalProperties: false,
};

export const videoReleaseCoverageSchema: ApiSchema = {
  type: 'array',
  description:
    'H3/Wan × SGLang/vLLM-Omni coverage within the loaded published pages, before the model filter. Missing sources do not prove no run exists. Sample floor met does not imply quality qualification.',
  items: {
    type: 'object',
    properties: {
      model: { type: 'string', enum: ['h3', 'wan22'] },
      engine: { type: 'string', enum: ['sglang', 'vllm-omni'] },
      status: {
        type: 'string',
        enum: ['not_published', 'failed', 'history_only', 'sample_floor_met'],
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            artifactId: { type: 'integer' },
            sourceId: { type: 'string' },
            producer: videoProducerSchema,
            status: { type: 'string', enum: ['failed', 'history_only', 'sample_floor_met'] },
            error: nullableText,
          },
          required: ['runId', 'artifactId', 'sourceId', 'producer', 'status', 'error'],
          additionalProperties: false,
        },
      },
    },
    required: ['model', 'engine', 'status', 'sources'],
    additionalProperties: false,
  },
};

export const videoPointSchema: ApiSchema = {
  type: 'object',
  properties: {
    quality: videoQualitySchema,
    producer: videoProducerSchema,
    deployment: {
      type: ['object', 'null'],
      properties: {
        gpusPerReplica: { type: ['integer', 'null'], minimum: 1 },
        ring: { type: ['integer', 'null'], minimum: 1 },
        cfg: { type: ['integer', 'null'], minimum: 1 },
        offload: {
          type: ['object', 'null'],
          properties: Object.fromEntries(
            ['ditCpu', 'ditLayerwise', 'textEncoderCpu', 'imageEncoderCpu', 'vaeCpu'].map((key) => [
              key,
              { type: ['boolean', 'null'] },
            ]),
          ),
          additionalProperties: false,
        },
        encoderParallel: nullableText,
        batchSize: { type: ['integer', 'null'], minimum: 1 },
        maxBatchSize: { type: ['integer', 'null'], minimum: 1 },
        batchDelayMs: { type: ['number', 'null'], minimum: 0 },
        scheduling: nullableText,
        engine: nullableText,
        precision: nullableText,
        acceleration: nullableText,
        generationKey: nullableText,
        configEvidence: nullableText,
      },
      additionalProperties: false,
    },
    hardwareHealth: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
        reason: nullableText,
        evidence: nullableText,
      },
      required: ['status', 'reason', 'evidence'],
      additionalProperties: false,
    },
    provenance: {
      type: ['object', 'null'],
      properties: {
        sourceId: { type: 'string' },
        manifestSha256: nullableHash,
        sourceSha: { type: 'string' },
        artifactDigest: nullableText,
        fidelity: nullableText,
        calibration: nullableText,
        releaseQualified: { type: ['boolean', 'null'] },
      },
      required: [
        'sourceId',
        'manifestSha256',
        'sourceSha',
        'artifactDigest',
        'fidelity',
        'calibration',
        'releaseQualified',
      ],
      additionalProperties: false,
    },
  },
  additionalProperties: true,
};

export const videoRowsSchema: ApiSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      point: videoPointSchema,
      metrics: { type: 'object', additionalProperties: { type: ['number', 'null'] } },
    },
    required: ['point', 'metrics'],
  },
};

export const videoQualitySelectionSchema: ApiSchema = {
  type: 'object',
  properties: {
    metric: { type: 'string', enum: QUALITY_METRIC_IDS },
    direction: { type: 'string', enum: ['higher'] },
    readerThreshold: nullableScore,
    thresholdProvenance: nullableText,
    active: { type: 'boolean' },
    eligible: { type: 'integer', minimum: 0 },
    exclusions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reasons: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'unjudged',
                'not_qualified',
                'missing_protocol',
                'missing_evaluator',
                'incomplete_coverage',
                'uncalibrated',
                'invalid_value',
                'incompatible_direction',
                'below_threshold',
              ],
            },
          },
        },
        required: ['id', 'reasons'],
      },
    },
    metricDefinition: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        labelZh: { type: 'string' },
        polarity: { type: 'string', enum: ['higher'] },
      },
      required: ['label', 'labelZh', 'polarity'],
    },
  },
  required: [
    'metric',
    'direction',
    'readerThreshold',
    'thresholdProvenance',
    'active',
    'eligible',
    'exclusions',
    'metricDefinition',
  ],
};

/** All planned cells, before performance chart eligibility or reader filters. */
export const videoServingEvidenceSchema: ApiSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      ...Object.fromEntries(
        ['id', 'runId', 'sourceId', 'hardware', 'sourceSha', 'status'].map((key) => [
          key,
          { type: 'string' },
        ]),
      ),
      ...Object.fromEntries(
        ['cell', 'workloadKey', 'mode', 'error'].map((key) => [key, nullableText]),
      ),
      ...Object.fromEntries(
        [
          'concurrency',
          'scheduled',
          'attempted',
          'completed',
          'failed',
          'timedOut',
          'notStarted',
          'valid',
          'unjudged',
          'legacyFailedSlots',
          'unfinished',
        ].map((key) => [key, { type: ['integer', 'null'], minimum: 0 }]),
      ),
      artifactId: { type: 'integer', minimum: 1 },
      deliveryDeadlineSeconds: { type: ['number', 'null'], minimum: 0 },
      qualitySloGoodput: {
        type: 'null',
        description:
          'Unavailable without per-media calibrated quality and deadline outcomes; never inferred from separate marginal counts.',
      },
      provenance: {
        type: 'string',
        enum: ['request-ledger', 'cell-summary', 'legacy-projection', 'unavailable'],
      },
    },
    required: [
      'id',
      'runId',
      'artifactId',
      'sourceId',
      'hardware',
      'sourceSha',
      'cell',
      'concurrency',
      'status',
      'workloadKey',
      'mode',
      'scheduled',
      'attempted',
      'completed',
      'failed',
      'timedOut',
      'notStarted',
      'valid',
      'unjudged',
      'legacyFailedSlots',
      'unfinished',
      'deliveryDeadlineSeconds',
      'qualitySloGoodput',
      'provenance',
      'error',
    ],
    additionalProperties: false,
  },
};
