// Neutral-format test fixtures.
//
// The CollectiveX frontend consumes the neutral GitHub artifacts a sweep run uploads: one
// matrix document (identified structurally) plus `case-attempt` records (discriminated by
// `record_type`), and assembles the served view dataset with `buildDatasetFromNeutral`.
// These builders emit those raw artifacts in the current neutral shape (no `format` tags, no
// retired EPLB/provenance/resource fields) and run them through the real assembler, so a
// fixture dataset exercises the exact ingest → synthesis → strict-view-validation path the
// route uses. A non-success case-attempt (`status: 'invalid'`) carries its terminal outcome
// in-band; the backend no longer emits standalone terminal-outcome documents. Building on the
// real pipeline also guarantees every returned CollectiveXSeries / CollectiveXDataset is
// view-schema-valid, which is what the data-helper tests operate on.

import { buildDatasetFromNeutral, type CollectiveXNeutralRunMeta } from './reader';
import type { CollectiveXDataset, CollectiveXSeries } from './types';

// View-schema-valid provenance primitives.
const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`;
const SQUASH_SHA256 = 'b'.repeat(64);
const SOURCE_SHA = 'c'.repeat(40);

type Json = Record<string, unknown>;

export interface RowOverrides {
  tokensPerRank?: number;
  globalTokens?: number;
  anomalies?: (string | Json)[];
  // Drops the `stage` component to unavailable (null latency) — a two-phase backend.
  stageUnavailable?: boolean;
  // Keeps `stage` measured but with zero logical bytes (host-staging → rate 0).
  stageZeroBytes?: boolean;
  correctnessPassed?: boolean;
  maxRelativeError?: number;
}

export interface ShardOverrides {
  caseId?: string;
  variant?: string;
  sku?: string;
  backend?: string;
  implName?: string;
  backendLineage?: string | null;
  deepepVersion?: string | null;
  ep?: number;
  mode?: string;
  phase?: string;
  routing?: string;
  eplb?: boolean;
  scope?: string;
  scaleUpTransport?: string;
  scaleOutTransport?: string | null;
  transport?: string;
  topologyClass?: string;
  nodes?: number;
  gpusPerNode?: number;
  scaleUpDomain?: number;
  worldSize?: number;
  deviceProduct?: string;
  vendor?: string;
  workload?: string;
  hidden?: number;
  topk?: number;
  experts?: number;
  ladder?: string;
  suite?: string;
  runId?: string;
  runAttempt?: string;
  attemptOrdinal?: number;
  sourceSha?: string;
  imageDigest?: string;
  squashSha256?: string;
  dtype?: string;
  combineDtype?: string;
  combineSemantics?: string;
  payloadUnit?: string;
  activationProfile?: string;
  resourceClass?: string;
  commUnitsKind?: string | null;
  configuredUnits?: number | null;
  status?: string;
  // In-band failure reasons for a non-success (`invalid`) case-attempt.
  reasons?: string[];
  rows?: RowOverrides[];
  // Emit the retired promotion-era identity fields so the legacy-passthrough path is
  // covered (series_id / allocation_id / series_factors present).
  legacyIdentity?: boolean;
}

function pct(base: number): Json {
  return { p50: base, p90: base * 1.08, p95: base * 1.12, p99: base * 1.2 };
}

function component(base: number, sampleCount = 512, origin = 'measured'): Json {
  return {
    availability: 'measured',
    origin,
    percentiles_us: pct(base),
    sample_count: sampleCount,
  };
}

function bytes(activation: number): Json {
  return {
    activation_data_bytes: activation,
    scale_bytes: 0,
    total_logical_bytes: activation,
  };
}

function makeRawRow(index: number, row: RowOverrides): Json {
  const tokensPerRank = row.tokensPerRank ?? 128 * (index + 1);
  const components: Json = {
    dispatch: component(417 + index),
    combine: component(392 + index),
    roundtrip: component(921 + index),
    isolated_sum: {
      availability: 'derived',
      origin: 'derived-percentile-sum',
      percentiles_us: pct(809 + index),
    },
    stage: row.stageUnavailable
      ? { availability: 'unavailable', percentiles_us: null }
      : component(120 + index),
  };
  const byteProvenance: Json = {
    dispatch: bytes(384763904),
    combine: bytes(384763904),
    roundtrip: bytes(769527808),
  };
  if (!row.stageUnavailable) {
    byteProvenance.stage = row.stageZeroBytes ? bytes(0) : bytes(192381952);
  }
  return {
    tokens_per_rank: tokensPerRank,
    global_tokens: row.globalTokens ?? tokensPerRank * 8,
    anomalies: row.anomalies,
    correctness: {
      passed: row.correctnessPassed ?? true,
      max_relative_error: row.maxRelativeError ?? 0.004,
    },
    routing: {
      fanout_mean: 6.55,
      routed_copies: 26839,
      expert_load_cv: 0.084,
      payload_rank_cv: 0.016,
      hotspot_ratio: 1.24,
      empty_expert_count: 0,
      empty_rank_count: 0,
    },
    receive: { max: 1725 },
    token_rate_at_latency_percentile: pct(8_338_218),
    components,
    byte_provenance: byteProvenance,
  };
}

function makeRawCase(o: ShardOverrides, caseId: string): Json {
  const kase: Json = {
    case_id: caseId,
    backend: o.backend ?? 'deepep-v2',
    ep: o.ep ?? 8,
    experts: o.experts ?? 256,
    gpus_per_node: o.gpusPerNode ?? 8,
    hidden: o.hidden ?? 7168,
    topk: o.topk ?? 8,
    ladder: o.ladder ?? '128 256',
    mode: o.mode ?? 'normal',
    nodes: o.nodes ?? 1,
    phase: o.phase ?? 'decode',
    routing: o.routing ?? 'uniform',
    scope: o.scope ?? 'scale-up',
    suite: o.suite ?? 'mvp',
    workload: o.workload ?? 'deepseek-v3',
    transport: o.transport ?? 'nvlink',
    topology_class: o.topologyClass ?? 'nvlink-domain',
    scale_up_domain: o.scaleUpDomain ?? 8,
    scale_up_transport: o.scaleUpTransport ?? 'nvlink',
    scale_out_transport: o.scaleOutTransport ?? null,
  };
  // `eplb` was retired from the neutral case; emit it only for the legacy-passthrough path
  // or when a test sets it explicitly, to prove the reader still tolerates it.
  if (o.legacyIdentity || o.eplb !== undefined) kase.eplb = o.eplb ?? false;
  return kase;
}

export function caseIdOf(o: ShardOverrides = {}): string {
  if (o.caseId) return o.caseId;
  const sku = o.sku ?? 'h200-dgxc';
  const backend = o.backend ?? 'deepep-v2';
  const workload = o.workload ?? 'deepseek-v3';
  const mode = o.mode ?? 'normal';
  const phase = o.phase ?? 'decode';
  const ep = o.ep ?? 8;
  const routing = o.routing ?? 'uniform';
  const tail = o.variant ? `-${o.variant}` : '';
  return `${sku}-${backend}-${workload}-${mode}-${phase}-ep${ep}-${routing}${tail}`;
}

export function makeRawShard(o: ShardOverrides = {}): Json {
  const caseId = caseIdOf(o);
  const sku = o.sku ?? 'h200-dgxc';
  const backend = o.backend ?? 'deepep-v2';
  const runId = o.runId ?? '160';
  const runAttempt = o.runAttempt ?? '1';
  const rowSpecs = o.rows ?? [{}, {}];

  const identity: Json = {
    case_id: caseId,
    attempt_ordinal: o.attemptOrdinal ?? 1,
    case_factors: {
      sku,
      case: makeRawCase({ ...o, backend }, caseId),
    },
    allocation_factors: {
      run_id: runId,
      run_attempt: runAttempt,
      source_sha: o.sourceSha ?? SOURCE_SHA,
    },
  };

  if (o.legacyIdentity) {
    identity.series_id = `cxseries-v1-${'d'.repeat(64)}`;
    identity.allocation_id = `cxalloc-v1-${'e'.repeat(64)}`;
    identity.series_factors = {
      backend,
      source_sha: o.sourceSha ?? SOURCE_SHA,
      image_digest: o.imageDigest ?? IMAGE_DIGEST,
      squash_sha256: o.squashSha256 ?? SQUASH_SHA256,
      workload_id: o.workload ?? 'deepseek-v3',
    };
  }

  return {
    record_type: 'case-attempt',
    generated_at: '2026-07-08T12:18:11Z',
    identity,
    provenance: { image: o.imageDigest ?? IMAGE_DIGEST, source_sha: o.sourceSha ?? SOURCE_SHA },
    topology: {
      device_product: o.deviceProduct,
      gpus_per_node: o.gpusPerNode ?? 8,
      nodes: o.nodes ?? 1,
      placement: 'packed',
      scale_out_transport: o.scaleOutTransport ?? null,
      scale_up_domain: o.scaleUpDomain ?? 8,
      scale_up_transport: o.scaleUpTransport ?? 'nvlink',
      scope: o.scope ?? 'scale-up',
      topology_class: o.topologyClass ?? 'nvlink-domain',
      transport: o.transport ?? 'nvlink',
      world_size: o.worldSize ?? (o.nodes ?? 1) * (o.gpusPerNode ?? 8),
    },
    implementation: {
      name: o.implName ?? backend,
      kernel_generation: 'generic',
      provenance: {
        deepep_version: o.deepepVersion ?? undefined,
        backend_lineage: o.backendLineage ?? undefined,
        mode: o.mode ?? 'normal',
      },
      resource_profile: {
        comm_units_kind: o.commUnitsKind ?? undefined,
        configured_units: o.configuredUnits ?? undefined,
        resource_class: o.resourceClass ?? 'fixed-profile',
      },
    },
    runtime: { vendor: o.vendor ?? 'nvidia' },
    // The neutral backend emits `workload: { cross_rank_consistent }` with no
    // activation_profile; only legacy shards (or an explicit override) carry it. Default to the
    // real shape so the ingest path is exercised as the backend actually emits it.
    workload:
      o.activationProfile !== undefined || o.legacyIdentity
        ? { cross_rank_consistent: true, activation_profile: o.activationProfile ?? 'balanced' }
        : { cross_rank_consistent: true },
    measurement: {
      dispatch_dtype: o.dtype ?? 'bf16',
      combine_dtype: o.combineDtype ?? 'bf16',
      combine_semantics: o.combineSemantics ?? 'weighted-sum',
      payload_unit: o.payloadUnit ?? 'tokens',
      sampling: {
        iterations_per_trial: 64,
        trials: 8,
        warmup_iterations: 16,
        samples_per_component: 512,
      },
      rows: rowSpecs.map((row, index) => makeRawRow(index, row)),
    },
    outcome: {
      status: o.status ?? 'success',
      // In-band failure reasons for a non-success (`invalid`/`failed`) case-attempt.
      ...(o.reasons ? { reasons: o.reasons } : {}),
    },
  };
}

// A non-success case-attempt. The backend no longer emits a standalone terminal-outcome
// document; a failed/invalid/unsupported case now carries its terminal outcome in-band on a
// `record_type: 'case-attempt'` doc whose `outcome.status !== 'success'` and whose
// `outcome.reasons` lists the failure reasons. Defaults to `invalid`. The raw schema still
// requires >= 1 measurement row, so the row block is present, but the reader ignores it for a
// non-success attempt. Overrides flow straight through to `makeRawShard`.
export function makeInvalidCaseAttempt(o: ShardOverrides = {}): Json {
  return makeRawShard({ status: 'invalid', reasons: ['capability-gate'], ...o });
}

interface RequestedCaseSpec {
  caseId: string;
  sku: string;
  disposition?: 'runnable' | 'unsupported';
  reason?: string;
  case: Json;
}

function requestedFromShard(shard: Json): RequestedCaseSpec {
  const identity = shard.identity as Json;
  const factors = identity.case_factors as Json;
  return {
    caseId: identity.case_id as string,
    sku: factors.sku as string,
    disposition: 'runnable',
    case: factors.case as Json,
  };
}

// The neutral matrix carries no `format`/`schema_version`; it is identified structurally by
// its `requested_cases[]` + `include[]` arrays and its numeric `version` (collectivex-github.ts).
export function makeRawMatrix(requested: RequestedCaseSpec[], version = 1): Json {
  return {
    version,
    include: [],
    requested_cases: requested.map((entry) => ({
      case: entry.case,
      sku: entry.sku,
      disposition: entry.disposition ?? 'runnable',
      reason: entry.reason ?? null,
      detail: entry.reason ? 'unsupported by the selected backend/platform' : null,
    })),
  };
}

export function makeRunMeta(
  overrides: Partial<CollectiveXNeutralRunMeta> = {},
): CollectiveXNeutralRunMeta {
  return {
    run_id: '160',
    run_attempt: 1,
    generated_at: '2026-07-08T12:20:00Z',
    conclusion: 'success',
    matrix_id: 'matrix-160',
    source_bundle_ids: ['cxshard-h200', 'cxmatrix-160'],
    ...overrides,
  };
}

export interface BuildDatasetOptions {
  shards?: Json[];
  // Extra requested cases beyond those derived from the shards (e.g. a pending case).
  requestedCases?: RequestedCaseSpec[];
  meta?: Partial<CollectiveXNeutralRunMeta>;
}

// Assemble a view dataset through the real neutral → view builder. Requested matrix
// cases default to one runnable case per shard so measured coverage is populated. Every
// shard is a `record_type: 'case-attempt'` doc — success shards and in-band non-success
// (invalid/failed) attempts alike flow through the same channel.
export function buildDataset(options: BuildDatasetOptions = {}): CollectiveXDataset {
  const shards = options.shards ?? [makeRawShard()];
  const requested = [...shards.map(requestedFromShard), ...(options.requestedCases ?? [])];
  const matrix = makeRawMatrix(requested);
  return buildDatasetFromNeutral(matrix, shards, makeRunMeta(options.meta));
}

// A single view series, assembled from one measured shard.
export function makeCollectiveXSeries(overrides: ShardOverrides = {}): CollectiveXSeries {
  return buildDataset({ shards: [makeRawShard(overrides)] }).series[0];
}

// Canonical multi-series dataset: two measured series (scale-up EP8 + scale-out EP16),
// one unsupported terminal case, and one pending case. Exercises series/coverage/attempt
// assembly plus every terminal disposition the run summary counts.
export function makeCollectiveXDataset(): CollectiveXDataset {
  const shardA = makeRawShard({ backend: 'deepep-v2', ep: 8 });
  const shardB = makeRawShard({
    sku: 'h200-dgxc',
    backend: 'deepep',
    implName: 'deepep',
    deepepVersion: '2.1',
    backendLineage: 'deepep-v2',
    ep: 16,
    scope: 'scale-out',
    scaleOutTransport: 'rdma',
    transport: 'rdma',
    topologyClass: 'multi-node',
    nodes: 2,
    gpusPerNode: 8,
    scaleUpDomain: 8,
  });

  const unsupportedCaseId = 'b300-sxm-deepep-hybrid-deepseek-v3-normal-decode-ep8-uniform';
  const unsupportedCase: RequestedCaseSpec = {
    caseId: unsupportedCaseId,
    sku: 'b300-sxm',
    disposition: 'unsupported',
    reason: 'capability-gate',
    case: makeRawCase(
      { backend: 'deepep-hybrid', sku: 'b300-sxm', nodes: 1, gpusPerNode: 8 },
      unsupportedCaseId,
    ),
  };

  const pendingCaseId = 'mi355x-oam-deepep-deepseek-v3-normal-decode-ep8-uniform';
  const pendingCase: RequestedCaseSpec = {
    caseId: pendingCaseId,
    sku: 'mi355x-oam',
    disposition: 'runnable',
    case: makeRawCase(
      { backend: 'deepep', sku: 'mi355x-oam', nodes: 1, gpusPerNode: 8 },
      pendingCaseId,
    ),
  };

  return buildDataset({
    shards: [shardA, shardB],
    requestedCases: [unsupportedCase, pendingCase],
  });
}
