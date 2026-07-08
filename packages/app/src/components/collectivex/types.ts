import { z } from 'zod';

export type CollectiveXPhase = 'decode' | 'prefill';
// The release version is a numeric, incrementable identity (1, 2, 3, ...), matching
// the backend release marker's "version": N. It is NOT the frozen data-format literal
// "v1" (cx*-v1-* ids, collectivex.*.v1 formats), which is the schema-version shared
// across releases. The neutral MVP backend only emits schema_version 1.
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

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceHash = z.string().regex(/^[a-f0-9]{40,64}$/);
// Accepts either the legacy content-hash id (`cx<kind>-v1-<hex64>`, still emitted by
// the promotion-era artifacts the fixtures use) or the neutral MVP backend's
// human-readable qualification id (e.g. `h200-dgxc-nccl-ep-deepseek-v3-normal-decode-
// ep8-uniform-2abdb08869ae`, `…-a01`, `…-t1`). Both are globally unique; the human form
// carries its own qualification-hash suffix. Kept as one helper so every id field keeps
// a single, consistent contract.
const typedId = (kind: string) =>
  z
    .string()
    .max(200)
    .regex(new RegExp(`^(?:cx${kind}-v1-[a-f0-9]{64}|[a-z0-9][a-z0-9_.-]*)$`));
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
const runId = z.string().regex(/^[1-9][0-9]*$/);
const mode = z.enum(['normal', 'low-latency']);
const topologyScope = z.enum(['scale-up', 'scale-out']);
const routingKind = z.enum(['uniform', 'zipf']);
const phase = z.enum(['decode', 'prefill']);
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

const percentilesSchema = z.strictObject({
  p50: z.number().finite().positive(),
  p90: z.number().finite().positive(),
  p95: z.number().finite().positive(),
  p99: z.number().finite().positive(),
});
// Data-rate percentiles admit 0.0: a host-staging component can have real
// latency while measuring zero logical bytes (rate = bytes / latency = 0).
// Latency percentiles stay strictly positive.
const ratePercentilesSchema = z.strictObject({
  p50: z.number().finite().nonnegative(),
  p90: z.number().finite().nonnegative(),
  p95: z.number().finite().nonnegative(),
  p99: z.number().finite().nonnegative(),
});
const byteAccountingSchema = z.strictObject({
  accounting_contract: z.literal('activation-data-plus-scales-v1'),
  activation_data_bytes: nonnegativeInteger,
  scale_bytes: nonnegativeInteger,
  total_logical_bytes: nonnegativeInteger,
});
// The neutral shard carries only dtype/quant/semantics per communication axis —
// the promotion-era 9-field communication axis and precision-profile enum are gone.
const precisionAxisSchema = z.strictObject({
  communication_format: safeId,
  quant_mode: safeId,
  semantics: safeId,
});

const outcome = z.enum(['success', 'unsupported', 'failed', 'invalid', 'diagnostic', 'pending']);
const terminalStatus = z.enum([
  'measured',
  'unsupported',
  'failed',
  'invalid',
  'diagnostic',
  'pending',
]);

// ---------------------------------------------------------------------------
// View model — series / points / components
//
// Reshaped-in-place from the retired promoted dataset: the same series → points →
// components shape the chart/tables/inventory render, but every field is now something
// the neutral cxshard/matrix artifacts actually carry (plus data rates the reader
// derives from byte_provenance ÷ latency). No promotion, ranking, or eligibility layer.
// ---------------------------------------------------------------------------
const componentSchema = z.strictObject({
  origin: z.enum(['measured', 'derived']),
  latency_us: percentilesSchema,
  // null for derived components (isolated_sum) — no byte accounting exists.
  byte_provenance: byteAccountingSchema.nullable(),
  activation_data_rate_gbps_at_latency_percentile: ratePercentilesSchema.nullable(),
  total_logical_data_rate_gbps_at_latency_percentile: ratePercentilesSchema.nullable(),
  sample_count: nonnegativeInteger.nullable(),
});
const routingSchema = z.strictObject({
  fanout_mean: z.number().finite().nonnegative(),
  routed_copies: nonnegativeInteger,
  recv_tokens_max: nonnegativeInteger,
  expert_load_cv: z.number().finite().nonnegative(),
  payload_rank_cv: z.number().finite().nonnegative(),
  hotspot_ratio: z.number().finite().nonnegative(),
  empty_expert_count: nonnegativeInteger,
  empty_rank_count: nonnegativeInteger,
});
const pointCorrectnessSchema = z.strictObject({
  passed: z.boolean(),
  max_relative_error: z.number().finite().nonnegative(),
  contract: safeId,
  scope: safeId,
});
const pointSchema = z.strictObject({
  point_id: typedId('point'),
  tokens_per_rank: positiveInteger,
  global_tokens: positiveInteger,
  anomalies: unique(reasonId).max(16),
  correctness: pointCorrectnessSchema,
  routing: routingSchema,
  components: z.strictObject({
    dispatch: componentSchema.nullable(),
    stage: componentSchema.nullable(),
    combine: componentSchema.nullable(),
    roundtrip: componentSchema.nullable(),
    isolated_sum: componentSchema.nullable(),
  }),
  roundtrip_token_rate_at_latency_percentile: ratePercentilesSchema,
  evidence_ids: unique(typedId('evidence')).min(1),
});
const seriesSchema = z.strictObject({
  series_id: typedId('series'),
  label,
  allocation_ids: unique(typedId('allocation')).min(1),
  model: safeId,
  suite: safeId,
  mode,
  phase,
  backend: z.strictObject({
    id: safeId,
    label,
    generation: label.nullable(),
    version: label.nullable(),
  }),
  build: z.strictObject({
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
    placement: safeId,
  }),
  workload: z.strictObject({
    workload_id: typedId('work'),
    hidden: positiveInteger,
    top_k: positiveInteger,
    experts: positiveInteger,
    routing: routingKind,
    eplb: z.boolean(),
    precision_profile: safeId,
    dispatch_precision: precisionAxisSchema,
    combine_precision: precisionAxisSchema,
    activation_profile: safeId,
  }),
  eplb: z.strictObject({
    enabled: z.boolean(),
    planner: label.nullable(),
    logical_experts: positiveInteger,
    physical_experts: positiveInteger.nullable(),
    redundant_experts: nonnegativeInteger,
    reference_tokens_per_rank: positiveInteger.nullable(),
    replicated_experts: nonnegativeInteger.nullable(),
    max_replicas: nonnegativeInteger.nullable(),
    imbalance_before: z.number().finite().nonnegative().nullable(),
    imbalance_after: z.number().finite().nonnegative().nullable(),
    mapping_sha256: hex64.nullable(),
  }),
  resource: z.strictObject({
    mode: safeId,
    profile: safeId,
    comm_units_kind: label.nullable(),
    configured_units: positiveInteger.nullable(),
  }),
  measurement: z.strictObject({
    contract: safeId,
    combine_semantics: safeId,
    payload_unit: safeId,
    iters: positiveInteger,
    trials: positiveInteger,
    warmups: nonnegativeInteger,
    samples_per_component: positiveInteger,
  }),
  points: z.array(pointSchema).min(1),
});

// ---------------------------------------------------------------------------
// View model — coverage / attempts (one coverage row per requested matrix case)
// ---------------------------------------------------------------------------
const coverageResourceSchema = z.strictObject({
  // All nullable: unsupported/pending cases carry no resource profile (that lives
  // only in a measured shard); measured coverage rows fill it from the shard.
  mode: safeId.nullable(),
  profile: safeId.nullable(),
  comm_units_kind: label.nullable(),
  configured_units: positiveInteger.nullable(),
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
    const measured = value.terminal_status === 'measured';
    if (measured && (value.point_id === null || value.series_id === null)) {
      context.addIssue({
        code: 'custom',
        path: ['point_id'],
        message: 'measured points require point/series references',
      });
    }
    if (!measured && (value.point_id !== null || value.series_id !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['point_id'],
        message: 'non-measured points must not carry point/series references',
      });
    }
    if (measured && value.reason !== null) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'measured points must not carry a reason',
      });
    }
    if (!measured && value.reason === null) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'non-measured points require a reason',
      });
    }
  });
const coverageSchema = z.strictObject({
  case_id: typedId('case'),
  label,
  disposition: z.enum(['runnable', 'unsupported']),
  sku: safeId,
  backend: safeId,
  backend_generation: label.nullable(),
  mode,
  phase,
  routing: routingKind,
  eplb: z.boolean(),
  precision_profile: safeId.nullable(),
  dispatch_precision: precisionAxisSchema.nullable(),
  combine_precision: precisionAxisSchema.nullable(),
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
  case_id: typedId('case'),
  allocation_id: typedId('allocation'),
  run_id: runId,
  run_attempt: positiveInteger,
  attempt_index: positiveInteger,
  outcome,
  failure_mode: reason,
  reason,
  selected: z.boolean(),
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
});

// ---------------------------------------------------------------------------
// Run metadata + dataset envelope
// ---------------------------------------------------------------------------
export const collectiveXRunSchema = z.strictObject({
  run_id: runId,
  run_attempt: positiveInteger,
  generated_at: timestamp,
  // GitHub Actions run conclusion; null while in progress. Discovery never gates on it.
  conclusion: safeId.nullable(),
  matrix_id: safeId.nullable(),
  requested_cases: nonnegativeInteger,
  terminal_cases: nonnegativeInteger,
  measured_cases: nonnegativeInteger,
  unsupported_cases: nonnegativeInteger,
  failed_cases: nonnegativeInteger,
  requested_points: nonnegativeInteger,
  terminal_points: nonnegativeInteger,
  measured_points: nonnegativeInteger,
  allocation_count: nonnegativeInteger,
  covered_skus: unique(safeId),
});
export const collectiveXDatasetSchema = z.strictObject({
  format: z.literal('collectivex.view.v1'),
  schema_version: z.literal(1),
  generated_at: timestamp,
  source_bundle_ids: unique(safeId),
  run: collectiveXRunSchema,
  coverage: z.array(coverageSchema),
  attempts: z.array(attemptSchema),
  series: z.array(seriesSchema),
});

// Run picker listing — keyed by run_id + attempt (no content digest).
export const collectiveXRunSummarySchema = z.strictObject({
  run_id: runId,
  run_attempt: positiveInteger,
  generated_at: timestamp,
  conclusion: safeId.nullable(),
  covered_skus: unique(safeId),
  terminal_counts: z.strictObject({
    measured: nonnegativeInteger,
    unsupported: nonnegativeInteger,
    failed: nonnegativeInteger,
  }),
});
export const collectiveXRunsSchema = z.strictObject({
  format: z.literal('collectivex.runs.v1'),
  version: positiveInteger,
  runs: z.array(collectiveXRunSummarySchema),
});

// ---------------------------------------------------------------------------
// Raw neutral artifact ingest schemas (server-side only, lenient).
//
// These validate the consumed subset of the three neutral artifact formats the
// reader downloads. Plain z.object strips unknown keys, so the reader stays
// tolerant of extra/future fields (e.g. a later top-level `version: N`).
// ---------------------------------------------------------------------------
const rawPercentilesSchema = z.object({
  p50: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number(),
});
const rawCaseSchema = z.object({
  case_id: z.string().optional(),
  backend: z.string(),
  ep: positiveInteger,
  eplb: z.boolean(),
  experts: positiveInteger,
  gpus_per_node: positiveInteger,
  hidden: positiveInteger,
  topk: positiveInteger,
  ladder: z.string(),
  mode: z.string(),
  nodes: positiveInteger,
  phase: z.string(),
  routing: z.string(),
  scope: z.string(),
  suite: z.string(),
  workload: z.string(),
  transport: z.string(),
  topology_class: z.string(),
  scale_up_domain: positiveInteger,
  scale_up_transport: z.string(),
  scale_out_transport: z.string().nullable(),
});
const rawProfileSchema = z.object({
  dtype: z.string(),
  combine_dtype: z.string(),
  // Absent in the neutral MVP profile (fixed-BF16 path, quant not swept); the reader
  // defaults it to 'none'. Present in legacy promotion-era profiles.
  combine_quant_mode: z.string().optional(),
  combine_semantics: z.string(),
  payload_unit: z.string(),
  activation_profile: z.string(),
  eplb_planner: z.string().nullable().optional(),
  eplb_redundant_experts: nonnegativeInteger.optional(),
  eplb_reference_tokens_per_rank: positiveInteger.optional(),
  resource_mode: z.string().optional(),
});
const rawTopologySchema = z.object({
  device_product: z.string().optional(),
  gpus_per_node: positiveInteger,
  nodes: positiveInteger,
  placement: z.string(),
  scale_out_transport: z.string().nullable(),
  scale_up_domain: positiveInteger,
  scale_up_transport: z.string(),
  scope: z.string(),
  topology_class: z.string(),
  transport: z.string(),
  world_size: positiveInteger,
});
const rawImplementationSchema = z.object({
  name: z.string(),
  kernel_generation: z.string(),
  provenance: z.object({
    deepep_version: z.string().optional(),
    deepep_commit: z.string().optional(),
    backend_lineage: z.string().optional(),
    mode: z.string().optional(),
  }),
  resource_profile: z.object({
    comm_units_kind: z.string().nullable().optional(),
    configured_units: positiveInteger.nullable().optional(),
    conformance_class: z.string().optional(),
    resource_class: z.string().optional(),
  }),
});
const rawComponentSchema = z.object({
  origin: z.string().nullable().optional(),
  availability: z.string(),
  // null for unavailable components (e.g. `stage` on a two-phase backend).
  percentiles_us: rawPercentilesSchema.nullable(),
  sample_count: nonnegativeInteger.optional(),
});
const rawByteAccountingSchema = z.object({
  activation_data_bytes: nonnegativeInteger,
  scale_bytes: nonnegativeInteger.optional(),
  total_logical_bytes: nonnegativeInteger,
});
const rawRowSchema = z.object({
  point_id: z.string(),
  // Legacy shards carry a content-hash evidence id; neutral shards identify a row's
  // evidence by its sample digest instead, so the reader synthesizes one from point_id.
  evidence_id: z.string().optional(),
  sample_sha256: z.string().optional(),
  tokens_per_rank: positiveInteger,
  global_tokens: positiveInteger,
  // Legacy shards list anomalies as reason-id strings; neutral shards emit structured
  // objects ({type, ...}). The reader slugifies both to reason ids.
  anomalies: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).optional(),
  correctness: z.object({
    passed: z.boolean(),
    max_relative_error: z.number(),
    contract: z.string(),
    scope: z.string(),
  }),
  routing: z.object({
    fanout_mean: z.number(),
    routed_copies: nonnegativeInteger,
    expert_load_cv: z.number(),
    payload_rank_cv: z.number(),
    hotspot_ratio: z.number(),
    empty_expert_count: nonnegativeInteger,
    empty_rank_count: nonnegativeInteger,
  }),
  receive: z.object({ max: nonnegativeInteger }),
  token_rate_at_latency_percentile: rawPercentilesSchema,
  components: z.record(z.string(), rawComponentSchema.nullable()),
  byte_provenance: z.record(z.string(), rawByteAccountingSchema),
});
export const collectiveXRawCaseAttemptSchema = z.object({
  format: z.literal('collectivex.ep.v1'),
  record_type: z.literal('case-attempt'),
  generated_at: z.string(),
  identity: z.object({
    // series_id/allocation_id/series_factors are legacy promotion-era fields. The neutral
    // MVP backend omits them; the reader derives series identity from case_id and series
    // factors from provenance/case below.
    series_id: z.string().optional(),
    case_id: z.string(),
    allocation_id: z.string().optional(),
    attempt_id: z.string(),
    attempt_ordinal: positiveInteger,
    series_factors: z
      .object({
        backend: z.string(),
        source_sha: z.string(),
        image_digest: z.string(),
        squash_sha256: z.string(),
        workload_id: z.string(),
      })
      .optional(),
    case_factors: z.object({
      sku: z.string(),
      case: rawCaseSchema,
      profile: rawProfileSchema,
    }),
    allocation_factors: z.object({
      run_id: z.string(),
      run_attempt: z.string(),
      runner: z.string().optional(),
      artifact: z.string().optional(),
      // Neutral fallback source for a synthesized allocation id / build source_sha.
      execution_id: z.string().optional(),
      source_sha: z.string().optional(),
    }),
  }),
  // Neutral shards carry image/source provenance the reader folds into series build
  // factors (legacy shards carried these inside identity.series_factors instead).
  provenance: z
    .object({
      image: z
        .object({
          digest: z.string().optional(),
          squash_sha256: z.string().optional(),
        })
        .optional(),
      git_run: z.object({ source_sha: z.string().optional() }).optional(),
    })
    .optional(),
  topology: rawTopologySchema,
  implementation: rawImplementationSchema,
  runtime_fingerprint: z.object({ vendor: z.string() }),
  measurement: z.object({
    contract: z.string(),
    sampling: z.object({
      iterations_per_trial: positiveInteger,
      trials: positiveInteger,
      warmup_iterations: nonnegativeInteger,
      samples_per_component: positiveInteger,
    }),
    rows: z.array(rawRowSchema).min(1),
  }),
  outcome: z.object({ status: z.string() }),
});
export const collectiveXRawTerminalSchema = z.object({
  format: z.literal('collectivex.terminal.v1'),
  record_type: z.literal('terminal-outcome'),
  generated_at: z.string(),
  identity: z.object({
    case_id: z.string().optional(),
    allocation_id: z.string().optional(),
    attempt_id: z.string().optional(),
    attempt_ordinal: positiveInteger.optional(),
    case_factors: z
      .object({
        sku: z.string(),
        case: rawCaseSchema.optional(),
      })
      .optional(),
    allocation_factors: z
      .object({
        run_id: z.string().optional(),
        run_attempt: z.string().optional(),
      })
      .optional(),
  }),
  outcome: z.object({
    status: z.string(),
    failure_mode: z.string().optional(),
    reason: z.string().nullable().optional(),
    return_code: z.number().int().optional(),
  }),
});
const rawMatrixIncludeSchema = z.object({
  id: z.string(),
  sku: z.string(),
  backend: z.string(),
  n: nonnegativeInteger,
  nodes: positiveInteger,
  gpus_per_node: positiveInteger,
  launcher: z.string(),
  scope: z.string(),
  topology_class: z.string(),
  transport: z.string(),
  scale_up_domain: positiveInteger.optional(),
  scale_up_transport: z.string().nullable().optional(),
  scale_out_transport: z.string().nullable().optional(),
  case_ids: z.array(z.string()),
  execution_weight: nonnegativeInteger.optional(),
});
const rawRequestedCaseSchema = z.object({
  case: rawCaseSchema,
  sku: z.string(),
  disposition: z.enum(['runnable', 'unsupported']),
  reason: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
});
export const collectiveXRawMatrixSchema = z.object({
  format: z.literal('collectivex.matrix.v1'),
  schema_version: nonnegativeInteger.optional(),
  include: z.array(rawMatrixIncludeSchema),
  requested_cases: z.array(rawRequestedCaseSchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type CollectiveXRunSummary = z.infer<typeof collectiveXRunSummarySchema>;
export type CollectiveXRuns = z.infer<typeof collectiveXRunsSchema>;
export type CollectiveXRun = z.infer<typeof collectiveXRunSchema>;
export type CollectiveXDataset = z.infer<typeof collectiveXDatasetSchema>;
export type CollectiveXComponent = z.infer<typeof componentSchema>;
export type CollectiveXPrecisionAxis = z.infer<typeof precisionAxisSchema>;
// Retained export name (shape slimmed to {communication_format, quant_mode, semantics}).
export type CollectiveXCommunicationAxis = CollectiveXPrecisionAxis;
export type CollectiveXPrecisionProfile = string;
export type CollectiveXRouting = z.infer<typeof routingSchema>;
export type CollectiveXPoint = z.infer<typeof pointSchema>;
export type CollectiveXPointCorrectness = z.infer<typeof pointCorrectnessSchema>;
export type CollectiveXSeries = z.infer<typeof seriesSchema>;
export type CollectiveXCoverage = z.infer<typeof coverageSchema>;
export type CollectiveXCoverageTopology = z.infer<typeof coverageTopologySchema>;
export type CollectiveXCoveragePoint = z.infer<typeof coveragePointSchema>;
export type CollectiveXTerminalStatus = z.infer<typeof terminalStatus>;
export type CollectiveXAttempt = z.infer<typeof attemptSchema>;
export type CollectiveXOutcome = z.infer<typeof outcome>;

export type CollectiveXRawMatrix = z.infer<typeof collectiveXRawMatrixSchema>;
export type CollectiveXRawCaseAttempt = z.infer<typeof collectiveXRawCaseAttemptSchema>;
export type CollectiveXRawTerminal = z.infer<typeof collectiveXRawTerminalSchema>;
export type CollectiveXRawCase = z.infer<typeof rawCaseSchema>;
export type CollectiveXRawProfile = z.infer<typeof rawProfileSchema>;
export type CollectiveXRawRow = z.infer<typeof rawRowSchema>;

export interface CollectiveXResolvedDataset {
  dataset: CollectiveXDataset;
  run_id: string;
  run_attempt: number;
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
