import { z } from 'zod';

export type CollectiveXPhase = 'decode' | 'prefill';
// The release version is a numeric, incrementable identity (1, 2, 3, ...), matching
// the backend release marker's "version": N and the cxpublication-<N>-* artifact name.
// It is NOT the frozen data-format literal "v1" (collectivex.public.v1, cx*-v1-*,
// collectivex_public_v1_*.ndjson), which is schema-version and shared across releases.
export const COLLECTIVEX_VERSIONS = [1] as const;
export type CollectiveXVersion = (typeof COLLECTIVEX_VERSIONS)[number];
export const COLLECTIVEX_DEFAULT_VERSION: CollectiveXVersion = Math.max(
  ...COLLECTIVEX_VERSIONS,
) as CollectiveXVersion;
export const collectiveXVersionLabel = (version: CollectiveXVersion): string => `V${version}`;
export function parseCollectiveXVersion(raw: string): CollectiveXVersion | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  return (COLLECTIVEX_VERSIONS as readonly number[]).includes(value)
    ? (value as CollectiveXVersion)
    : null;
}
export type CollectiveXMode = 'normal' | 'low-latency';
export type CollectiveXTopologyScope = 'scale-up' | 'scale-out';
export type CollectiveXOperation = 'dispatch' | 'stage' | 'combine' | 'roundtrip' | 'isolated-sum';
export type CollectiveXPercentile = 'p50' | 'p90' | 'p95' | 'p99';
export type CollectiveXXAxis = 'tokens-per-rank' | 'global-tokens';
export type CollectiveXYAxis =
  | 'latency'
  | 'tokens-per-second'
  | 'activation-rate'
  | 'total-logical-rate';
export type CollectiveXScale = 'log' | 'linear';

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceHash = z.string().regex(/^[a-f0-9]{40,64}$/);
const typedId = (kind: string) => z.string().regex(new RegExp(`^cx${kind}-v1-[a-f0-9]{64}$`));
const safeId = z
  .string()
  .max(128)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/);
const label = z.string().min(1).max(160);
const reasonId = z
  .string()
  .max(96)
  .regex(/^[a-z0-9][a-z0-9.-]*$/);
const reason = reasonId.nullable();
const timestamp = z.iso.datetime({ offset: true });
const positiveInteger = z.number().int().safe().positive();
const nonnegativeInteger = z.number().int().safe().nonnegative();
const publicationTier = z.enum(['official', 'comparable-experimental']);
const mode = z.enum(['normal', 'low-latency']);
const topologyScope = z.enum(['scale-up', 'scale-out']);
const unique = <T>(schema: z.ZodType<T>) =>
  z.array(schema).refine((items) => new Set(items).size === items.length, 'duplicate values');
const canonicalJson = (value: unknown): string =>
  JSON.stringify(
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value)
            .toSorted(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, JSON.parse(canonicalJson(item))]),
        )
      : Array.isArray(value)
        ? value.map((item) => JSON.parse(canonicalJson(item)))
        : value,
  );
const uniqueObjects = <T>(schema: z.ZodType<T>) =>
  z
    .array(schema)
    .refine((items) => new Set(items.map(canonicalJson)).size === items.length, 'duplicate values');

export const collectiveXChannelSchema = z.strictObject({
  format: z.literal('collectivex.channel.v1'),
  channel: z.literal('dev-latest'),
  generated_at: timestamp,
  dataset: z.strictObject({
    path: z.string().regex(/^datasets\/[a-f0-9]{64}\/dataset\.json$/),
    sha256: hex64,
    bytes: positiveInteger.max(32 * 1024 * 1024),
  }),
});

const percentilesSchema = z.strictObject({
  p50: z.number().finite().positive(),
  p90: z.number().finite().positive(),
  p95: z.number().finite().positive(),
  p99: z.number().finite().positive(),
});
const communicationAxisSchema = z.strictObject({
  alignment_contract: z.enum([
    'native-bf16-vector-alignment',
    'hidden-block-128',
    'native-fp8-vector-alignment',
    'value-block-64',
  ]),
  api_input_dtype: z.enum(['bf16', 'fp8-e4m3fn-with-f32-scale', 'fp8-e4m3fnuz-with-f32-scale']),
  api_output_dtype: z.enum(['bf16', 'fp8-e4m3fn-with-f32-scale', 'fp8-e4m3fnuz-with-f32-scale']),
  communication_format: z.enum(['bf16', 'fp8-e4m3fn', 'fp8-e4m3fnuz', 'logfmt10']),
  conversion_boundary: z.enum([
    'none',
    'before-dispatch-timing',
    'inside-dispatch-timing',
    'inside-combine-timing',
  ]),
  padding_contract: z.enum(['none', 'right-zero-pad-hidden-to-128', 'right-zero-pad-values-to-64']),
  quantization_origin: z.enum([
    'none',
    'caller-prequantized',
    'backend-fused',
    'backend-internal',
    'backend-internal-direct-cast',
  ]),
  scale_dtype: z.enum(['f32', 'implicit-logfmt10']).nullable(),
  scale_group_size: z.union([z.literal(64), z.literal(128)]).nullable(),
  scale_layout: z.enum(['none', 'per-token-hidden-block', 'dynamic-per-64-values']),
});
const precisionProfileSchema = z.enum([
  'd-bf16.c-bf16',
  'd-fp8-e4m3fn-b128-f32-prequantized.c-bf16',
  'd-fp8-e4m3fnuz-b128-f32-prequantized.c-bf16',
  'd-fp8-e4m3fn-b128-f32-fused.c-bf16',
  'd-bf16.c-logfmt10-dynamic64',
  'd-fp8-e4m3fn-b128-f32-fused.c-logfmt10-dynamic64',
  'd-bf16.c-fp8-e4m3fn-direct-cast-noscale',
  'd-fp8-e4m3fn-b128-f32-prequantized.c-fp8-e4m3fn-direct-cast-noscale',
  'd-bf16.c-fp8-e4m3fnuz-direct-cast-noscale',
  'd-fp8-e4m3fnuz-b128-f32-prequantized.c-fp8-e4m3fnuz-direct-cast-noscale',
]);
const byteAccountingSchema = z.strictObject({
  accounting_contract: z.literal('activation-data-plus-scales-v1'),
  activation_data_bytes: nonnegativeInteger,
  scale_bytes: nonnegativeInteger,
  total_logical_bytes: nonnegativeInteger,
});
const componentSchema = z
  .strictObject({
    origin: z.enum(['measured', 'derived']),
    latency_us: percentilesSchema,
    byte_provenance: byteAccountingSchema,
    activation_data_rate_gbps_at_latency_percentile: percentilesSchema.nullable(),
    total_logical_data_rate_gbps_at_latency_percentile: percentilesSchema.nullable(),
    sample_count: positiveInteger.nullable(),
  })
  .superRefine((value, context) => {
    if (value.origin === 'measured' && value.sample_count !== 512) {
      context.addIssue({
        code: 'custom',
        path: ['sample_count'],
        message: 'measured components require exactly 512 samples',
      });
    }
    if (value.origin === 'derived' && value.sample_count !== null) {
      context.addIssue({
        code: 'custom',
        path: ['sample_count'],
        message: 'derived components require a null sample count',
      });
    }
  });
const routingEvidenceSchema = z.strictObject({
  fanout_mean: z.number().finite().nonnegative(),
  recv_tokens_max: nonnegativeInteger,
  expert_load_cv: z.number().finite().nonnegative(),
  payload_rank_cv: z.number().finite().nonnegative(),
  hotspot_ratio: z.number().finite().nonnegative(),
  empty_expert_count: nonnegativeInteger,
  empty_rank_count: nonnegativeInteger,
  routed_copies: positiveInteger,
});
const precisionAxisEvidenceSchema = z.strictObject({
  dequantized_semantics: z.boolean(),
  encoded_payload_valid: z.boolean(),
  max_abs_error: z.number().finite().nonnegative(),
  max_rel_error: z.number().finite().nonnegative(),
  passed: z.boolean(),
  saturation_count: nonnegativeInteger,
  saturation_rate: z.number().finite().min(0).max(1),
  scales_finite: z.boolean().nullable(),
  scales_positive: z.boolean().nullable(),
});
const pointCorrectnessSchema = z.strictObject({
  semantic_pass: z.boolean(),
  precision: z.strictObject({
    combine: precisionAxisEvidenceSchema,
    dispatch: precisionAxisEvidenceSchema,
    passed: z.boolean(),
    profile_id: precisionProfileSchema,
  }),
});
const qualificationIndex = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const trialDiagnosticComponentSchema = z.strictObject({
  drift_flagged: z.boolean(),
  first_last_median_ratio: z.number().finite().min(1),
  outlier_flagged: z.boolean(),
  robust_outlier_fraction: z.number().finite().min(0).max(1),
  trial_count: z.literal(192),
});
const trialDiagnosticsSchema = z
  .strictObject({
    flagged: z.boolean(),
    reasons: unique(z.enum(['trial-drift', 'trial-outliers'])).max(2),
    components: z.strictObject({
      dispatch: trialDiagnosticComponentSchema.nullable(),
      stage: trialDiagnosticComponentSchema.nullable(),
      combine: trialDiagnosticComponentSchema.nullable(),
      roundtrip: trialDiagnosticComponentSchema.nullable(),
    }),
  })
  .refine((value) => value.flagged === value.reasons.length > 0, {
    path: ['reasons'],
    message: 'trial diagnostic reasons must be present exactly when flagged',
  });
const eligibilitySchema = z
  .strictObject({
    decision_grade: z.boolean(),
    allocation_ids: unique(typedId('allocation')),
    complete: z.boolean(),
    correct: z.boolean(),
    measured_roundtrip_p99: z.boolean(),
    stable_ordering: z.boolean(),
    reasons: unique(reason.unwrap()),
  })
  .refine((value) => value.decision_grade === (value.reasons.length === 0), {
    path: ['reasons'],
    message:
      'decision-grade eligibility must have no reasons; diagnostic eligibility must have reasons',
  });
const coverageTopologySchema = z.strictObject({
  ep_size: positiveInteger,
  nodes: positiveInteger,
  gpus_per_node: positiveInteger,
  scale_up_domain: positiveInteger,
  scope: topologyScope,
  scale_up_transport: safeId,
  scale_out_transport: safeId.nullable(),
  transport: safeId,
  topology_class: safeId,
});
const pointSchema = z.strictObject({
  point_id: typedId('point'),
  tokens_per_rank: positiveInteger,
  global_tokens: positiveInteger,
  anomalies: unique(reasonId).max(16),
  correctness: pointCorrectnessSchema,
  trial_diagnostics: trialDiagnosticsSchema,
  routing: routingEvidenceSchema,
  components: z.strictObject({
    dispatch: componentSchema.nullable(),
    stage: componentSchema.nullable(),
    combine: componentSchema.nullable(),
    roundtrip: componentSchema.nullable(),
    isolated_sum: componentSchema.nullable(),
  }),
  roundtrip_token_rate_at_latency_percentile: percentilesSchema,
  evidence_ids: unique(typedId('evidence')).min(1).max(3),
});
const seriesSchema = z.strictObject({
  series_id: typedId('series'),
  label,
  status: z.enum(['decision-grade', 'diagnostic']),
  case_ids: unique(typedId('case')).min(1),
  allocation_ids: unique(typedId('allocation')).min(1),
  model: safeId,
  suite: safeId,
  mode,
  publication_tier: publicationTier,
  phase: z.enum(['decode', 'prefill']),
  backend: z.strictObject({
    id: safeId,
    label,
    role: z.enum(['library', 'reference']),
    generation: label.nullable(),
    version: label.nullable(),
  }),
  build: z.strictObject({
    implementation_contract_sha256: hex64,
    public_config_sha256: hex64,
    routing_control_sha256: hex64,
    runtime_fingerprint_sha256: hex64,
    image_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    source_sha: sourceHash,
    squash_sha256: hex64,
  }),
  system: z.strictObject({
    sku: safeId,
    label,
    vendor: z.enum(['nvidia', 'amd']),
    topology_class: safeId,
    transport: safeId,
    scale_up_transport: safeId,
    scale_out_transport: safeId.nullable(),
    scope: topologyScope,
    nodes: positiveInteger,
    gpus_per_node: positiveInteger,
    scale_up_domain: positiveInteger,
    world_size: positiveInteger,
    ep_size: positiveInteger,
    placement: z.literal('packed'),
  }),
  workload: z.strictObject({
    workload_id: typedId('work'),
    hidden: positiveInteger,
    top_k: positiveInteger,
    experts: positiveInteger,
    routing: z.enum(['uniform', 'zipf']),
    eplb: z.boolean(),
    precision_profile: precisionProfileSchema,
    dispatch_precision: communicationAxisSchema,
    combine_precision: communicationAxisSchema,
    activation_profile: z.literal('canonical-counter-source-v4'),
  }),
  eplb: z
    .strictObject({
      enabled: z.boolean(),
      calibration_workload_id: typedId('work').nullable(),
      calibration_trace_sha256: hex64.nullable(),
      calibration_window: z.literal('collectivex-eplb-calibration-window-v1').nullable(),
      calibration_token_offset: nonnegativeInteger.nullable(),
      planner: label.nullable(),
      mapping_sha256: hex64.nullable(),
      logical_experts: positiveInteger,
      physical_experts: positiveInteger,
      redundant_experts: nonnegativeInteger,
      reference_tokens_per_rank: positiveInteger.nullable(),
      replicated_experts: nonnegativeInteger,
      max_replicas: nonnegativeInteger.nullable(),
      imbalance_before: z.number().finite().nonnegative().nullable(),
      imbalance_after: z.number().finite().nonnegative().nullable(),
    })
    .superRefine((value, context) => {
      const calibration = [
        value.calibration_workload_id,
        value.calibration_trace_sha256,
        value.calibration_window,
        value.calibration_token_offset,
      ];
      if (
        value.enabled
          ? calibration.some((item) => item === null)
          : calibration.some((item) => item !== null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['calibration_workload_id'],
          message: 'EPLB calibration fields must be present exactly when EPLB is enabled',
        });
      }
    }),
  resource: z.strictObject({
    mode: z.literal('fixed-profile'),
    profile: safeId,
    comm_units_kind: label.nullable(),
    configured_units: positiveInteger.nullable(),
  }),
  measurement: z.strictObject({
    contract: z.enum(['layout-and-dispatch-v1', 'expert-packed-weighted-combine-v1']),
    component_order_contract: z.literal('qualification-hash-rotated-components-v1'),
    combine_semantics: z.enum(['activation-only', 'gate-weighted']),
    payload_unit: z.enum(['token-rank', 'token-expert']),
    sampling_contract: z.literal('fixed-512-v1'),
    iters: z.literal(8),
    trials: z.literal(64),
    warmups: z.literal(32),
    samples_per_component: z.literal(512),
    qualification_indices: unique(qualificationIndex).min(1).max(3),
    headline_component: z.literal('roundtrip'),
    headline_percentile: z.literal('p99'),
  }),
  points: z.array(pointSchema).min(1),
  eligibility: eligibilitySchema,
});
const outcome = z.enum(['success', 'unsupported', 'failed', 'invalid', 'diagnostic']);
const coverageResourceSchema = z.strictObject({
  mode: z.literal('fixed-profile'),
  profile: safeId.nullable(),
  comm_units_kind: label.nullable(),
  configured_units: positiveInteger.nullable(),
});
const terminalStatus = z.enum(['measured', 'unsupported', 'failed', 'invalid', 'diagnostic']);
const coveragePointSchema = z
  .strictObject({
    point_id: typedId('point').nullable(),
    series_id: typedId('series').nullable(),
    tokens_per_rank: positiveInteger,
    global_tokens: positiveInteger,
    terminal_status: terminalStatus,
    reason,
  })
  .superRefine((value, context) => {
    if (
      (value.terminal_status === 'measured' &&
        (value.point_id === null || value.series_id === null)) ||
      (value.terminal_status === 'unsupported' &&
        (value.point_id !== null || value.series_id !== null))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['point_id'],
        message: `${value.terminal_status} point references are inconsistent`,
      });
    }
    if (
      (value.terminal_status === 'measured' && value.reason !== null) ||
      (['unsupported', 'failed', 'invalid'].includes(value.terminal_status) &&
        value.reason === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: `${value.terminal_status} point reason is inconsistent`,
      });
    }
  });
const coverageSchema = z.strictObject({
  case_id: typedId('case'),
  label,
  required: z.boolean(),
  disposition: z.enum(['runnable', 'unsupported']),
  sku: safeId,
  suite: safeId,
  workload: safeId,
  publication_tier: publicationTier,
  backend: safeId,
  backend_generation: label.nullable(),
  mode,
  phase: z.enum(['decode', 'prefill']),
  routing: z.enum(['uniform', 'zipf']),
  eplb: z.boolean(),
  precision_profile: precisionProfileSchema,
  dispatch_precision: communicationAxisSchema,
  combine_precision: communicationAxisSchema,
  resource: coverageResourceSchema,
  topology: coverageTopologySchema,
  points: uniqueObjects(coveragePointSchema).min(1),
  selected_attempt_id: typedId('attempt').nullable(),
  outcome,
  failure_mode: reason,
  reason,
  attempt_ids: unique(typedId('attempt')),
});
const attemptSchema = z.strictObject({
  attempt_id: typedId('attempt'),
  evidence: z
    .array(
      z.strictObject({
        evidence_id: typedId('evidence'),
        point_id: typedId('point'),
      }),
    )
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.evidence_id}\0${item.point_id}`)).size === items.length,
      'duplicate evidence items',
    ),
  case_id: typedId('case'),
  allocation_id: typedId('allocation'),
  run_id: z.string().regex(/^[1-9][0-9]*$/),
  run_attempt: positiveInteger,
  qualification_index: qualificationIndex,
  attempt_index: positiveInteger,
  outcome,
  failure_mode: reason,
  reason,
  series_id: typedId('series').nullable(),
  selected: z.boolean(),
  completed_at: timestamp.nullable(),
});
const metricSchema = z.strictObject({
  operation: z.literal('roundtrip'),
  statistic: z.enum(['p50', 'p99']),
  measure: z.enum([
    'latency_us',
    'activation_data_rate_gbps_at_latency_percentile',
    'total_logical_data_rate_gbps_at_latency_percentile',
  ]),
  objective: z.enum(['min', 'max']),
  tokens_per_rank: positiveInteger,
  phase: z.enum(['decode', 'prefill']),
});
const cohortSchema = z.strictObject({
  cohort_id: typedId('cohort'),
  kind: z.enum([
    'library',
    'chip',
    'system',
    'routing',
    'dispatch-precision',
    'combine-precision',
    'precision-pair',
  ]),
  label,
  description: label,
  publication_tier: publicationTier,
  series_ids: unique(typedId('series')).min(2),
  controlled_factors: unique(safeId).min(1),
  varying_factors: unique(safeId).min(1),
  eligibility: eligibilitySchema,
});
const rankingSchema = z.strictObject({
  ranking_id: typedId('ranking'),
  cohort_id: typedId('cohort'),
  label,
  publication_tier: publicationTier,
  metric: metricSchema,
  entries: z
    .array(
      z.strictObject({
        rank: positiveInteger,
        series_id: typedId('series'),
        point_id: typedId('point'),
        value: z.number().finite().positive(),
        unit: z.enum(['us', 'GB/s']),
      }),
    )
    .min(2),
  eligibility: eligibilitySchema,
});
const recommendationSchema = z.strictObject({
  recommendation_id: typedId('recommendation'),
  cohort_id: typedId('cohort'),
  label,
  objective: z.enum([
    'min-p50-latency',
    'min-p99-latency',
    'max-activation-data-rate-at-p50-latency',
    'max-activation-data-rate-at-p99-latency',
    'max-total-logical-data-rate-at-p50-latency',
    'max-total-logical-data-rate-at-p99-latency',
  ]),
  publication_tier: z.literal('official'),
  series_id: typedId('series'),
  point_id: typedId('point'),
  value: z.number().finite().positive(),
  unit: z.enum(['us', 'GB/s']),
  rationale: label,
  eligibility: eligibilitySchema,
});
const sensitivitySchema = z.strictObject({
  sensitivity_id: typedId('sensitivity'),
  cohort_id: typedId('cohort'),
  label,
  publication_tier: publicationTier,
  baseline_series_id: typedId('series'),
  candidate_series_id: typedId('series'),
  metric: metricSchema,
  signed_change_ratio: z.number().finite(),
  eligibility: eligibilitySchema,
});

export const collectiveXDatasetSchema = z.strictObject({
  format: z.literal('collectivex.public.v1'),
  schema_version: z.literal(1),
  generated_at: timestamp,
  source_bundle_ids: unique(hex64),
  promotion: z.strictObject({
    status: z.enum(['promoted', 'diagnostic', 'quarantined']),
    reason,
    matrix_id: hex64.nullable(),
    allocation_ids: unique(typedId('allocation')),
    required_allocations: z.literal(1),
    qualification_indices: unique(z.literal(1)).max(1),
    requested_cases: nonnegativeInteger,
    terminal_cases: nonnegativeInteger,
    measured_cases: nonnegativeInteger,
    unsupported_cases: nonnegativeInteger,
    requested_points: nonnegativeInteger,
    terminal_points: nonnegativeInteger,
    measured_points: nonnegativeInteger,
    unsupported_points: nonnegativeInteger,
    policy: z.literal('collectivex-decision-grade-v1'),
  }),
  coverage: z.array(coverageSchema),
  attempts: z.array(attemptSchema),
  series: z.array(seriesSchema),
  cohorts: z.array(cohortSchema),
  rankings: z.array(rankingSchema),
  recommendations: z.array(recommendationSchema),
  sensitivities: z.array(sensitivitySchema),
});

export type CollectiveXChannel = z.infer<typeof collectiveXChannelSchema>;
export type CollectiveXDataset = z.infer<typeof collectiveXDatasetSchema>;
export type CollectiveXComponent = z.infer<typeof componentSchema>;
export type CollectiveXCommunicationAxis = z.infer<typeof communicationAxisSchema>;
export type CollectiveXPrecisionProfile = z.infer<typeof precisionProfileSchema>;
export type CollectiveXPoint = z.infer<typeof pointSchema>;
export type CollectiveXPointCorrectness = z.infer<typeof pointCorrectnessSchema>;
export type CollectiveXSeries = z.infer<typeof seriesSchema>;
export type CollectiveXCoverage = z.infer<typeof coverageSchema>;
export type CollectiveXCoverageTopology = z.infer<typeof coverageTopologySchema>;
export type CollectiveXCoveragePoint = z.infer<typeof coveragePointSchema>;
export type CollectiveXTerminalStatus = z.infer<typeof terminalStatus>;
export type CollectiveXAttempt = z.infer<typeof attemptSchema>;
export type CollectiveXEligibility = z.infer<typeof eligibilitySchema>;
export type CollectiveXMetric = z.infer<typeof metricSchema>;
export type CollectiveXCohort = z.infer<typeof cohortSchema>;
export type CollectiveXRanking = z.infer<typeof rankingSchema>;
export type CollectiveXRecommendation = z.infer<typeof recommendationSchema>;
export type CollectiveXSensitivity = z.infer<typeof sensitivitySchema>;
export type CollectiveXOutcome = z.infer<typeof outcome>;
export type CollectiveXPublicationTier = z.infer<typeof publicationTier>;
export interface CollectiveXResolvedDataset {
  channel: CollectiveXChannel;
  dataset: CollectiveXDataset;
  digest: string;
}
export interface CollectiveXChartPoint {
  seriesId: string;
  seriesLabel: string;
  colorKey: string;
  x: number;
  y: number;
  operation: CollectiveXOperation;
  percentile: CollectiveXPercentile;
  point: CollectiveXPoint;
  series: CollectiveXSeries;
}
