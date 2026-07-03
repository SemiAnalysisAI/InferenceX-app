import { z } from 'zod';

export type CollectiveXPhase = 'decode' | 'prefill';
export const COLLECTIVEX_VERSIONS = ['v1'] as const;
export type CollectiveXVersion = (typeof COLLECTIVEX_VERSIONS)[number];
export type CollectiveXMode = 'normal' | 'low-latency';
export type CollectiveXTopologyScope = 'scale-up' | 'scale-out';
export type CollectiveXOperation = 'dispatch' | 'combine' | 'roundtrip' | 'isolated-sum';
export type CollectiveXPercentile = 'p50' | 'p90' | 'p95' | 'p99';
export type CollectiveXXAxis = 'tokens-per-rank' | 'global-tokens';
export type CollectiveXYAxis = 'latency' | 'tokens-per-second' | 'payload-rate';
export type CollectiveXScale = 'log' | 'linear';

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceHash = z.string().regex(/^[a-f0-9]{40,64}$/);
const typedId = (kind: string) => z.string().regex(new RegExp(`^cx${kind}-v1-[a-f0-9]{64}$`));
const safeId = z
  .string()
  .max(128)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/);
const label = z.string().min(1).max(160);
const reason = z
  .string()
  .max(96)
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .nullable();
const timestamp = z.iso.datetime({ offset: true });
const positiveInteger = z.number().int().safe().positive();
const nonnegativeInteger = z.number().int().safe().nonnegative();
const publicationTier = z.enum(['official', 'comparable-experimental']);
const mode = z.enum(['normal', 'low-latency']);
const topologyScope = z.enum(['scale-up', 'scale-out']);
const unique = <T>(schema: z.ZodType<T>) =>
  z.array(schema).refine((items) => new Set(items).size === items.length, 'duplicate values');

export const collectiveXChannelSchema = z.strictObject({
  format: z.literal('collectivex.channel.v1'),
  channel: z.enum(['latest-attempt', 'dev-latest']),
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
const componentSchema = z.strictObject({
  origin: z.enum(['measured', 'derived']),
  latency_us: percentilesSchema,
  logical_bytes: positiveInteger.nullable(),
  logical_payload_rate_gbps_at_latency_percentile: percentilesSchema.nullable(),
  sample_count: positiveInteger.nullable(),
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
const eligibilitySchema = z
  .strictObject({
    decision_grade: z.boolean(),
    allocation_ids: unique(typedId('allocation')),
    complete: z.boolean(),
    correct: z.boolean(),
    measured_roundtrip_p99: z.boolean(),
    stable_p50: z.boolean(),
    stable_p99: z.boolean(),
    stable_ordering: z.boolean(),
    p50_max_min_ratio: z.number().finite().min(1).nullable(),
    p99_max_min_ratio: z.number().finite().min(1).nullable(),
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
  correct: z.boolean(),
  routing: routingEvidenceSchema,
  components: z.strictObject({
    dispatch: componentSchema.nullable(),
    combine: componentSchema.nullable(),
    roundtrip: componentSchema.nullable(),
    isolated_sum: componentSchema.nullable(),
  }),
  roundtrip_token_rate_at_latency_percentile: percentilesSchema,
  evidence_ids: unique(typedId('evidence')),
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
    dispatch_dtype: z.literal('bf16'),
    combine_dtype: z.literal('bf16'),
    activation_profile: z.literal('canonical-counter-source-v3'),
  }),
  eplb: z.strictObject({
    enabled: z.boolean(),
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
  }),
  resource: z.strictObject({
    mode: z.literal('tuned'),
    profile: safeId,
    comm_units_kind: label.nullable(),
    configured_units: positiveInteger.nullable(),
  }),
  measurement: z.strictObject({
    contract: z.enum(['layout-and-dispatch-v1', 'expert-packed-weighted-combine-v1']),
    component_order_contract: z.enum([
      'roundtrip-dispatch-activation-only-combine-v2',
      'roundtrip-dispatch-gate-weighted-combine-v1',
    ]),
    combine_semantics: z.enum(['activation-only', 'gate-weighted']),
    payload_unit: z.enum(['token-rank', 'token-expert']),
    sampling_contract: z.literal('fixed-512-v1'),
    iters: z.literal(8),
    trials: z.literal(64),
    warmups: z.literal(32),
    samples_per_component: z.literal(512),
    headline_component: z.literal('roundtrip'),
    headline_percentile: z.literal('p99'),
  }),
  points: z.array(pointSchema).min(1),
  eligibility: eligibilitySchema,
});
const outcome = z.enum(['success', 'unsupported', 'failed', 'invalid', 'diagnostic']);
const coverageSchema = z.strictObject({
  case_id: typedId('case'),
  label,
  required: z.boolean(),
  disposition: z.enum(['runnable', 'unsupported']),
  sku: safeId,
  backend: safeId,
  mode,
  phase: z.enum(['decode', 'prefill']),
  topology: coverageTopologySchema,
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
  measure: z.enum(['latency_us', 'logical_payload_rate_gbps_at_latency_percentile']),
  objective: z.enum(['min', 'max']),
  tokens_per_rank: positiveInteger,
  phase: z.enum(['decode', 'prefill']),
});
const cohortSchema = z.strictObject({
  cohort_id: typedId('cohort'),
  kind: z.enum(['library', 'chip', 'system', 'routing']),
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
    'max-payload-rate-at-p50-latency',
    'max-payload-rate-at-p99-latency',
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
    required_allocations: z.literal(3),
    requested_cases: nonnegativeInteger,
    terminal_cases: nonnegativeInteger,
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
export type CollectiveXPoint = z.infer<typeof pointSchema>;
export type CollectiveXSeries = z.infer<typeof seriesSchema>;
export type CollectiveXCoverage = z.infer<typeof coverageSchema>;
export type CollectiveXCoverageTopology = z.infer<typeof coverageTopologySchema>;
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
