import { buildDatasetFromNeutral, type CollectiveXNeutralRunMeta } from './reader';
import type { CollectiveXDataset, CollectiveXSeries } from './types';

type Json = Record<string, unknown>;

const SOURCE_SHA = 'c'.repeat(40);
const TOKEN_LADDERS = {
  decode: '1 2 4 8 16 32 64 128 256 512',
  prefill: '256 512 1024 2048',
} as const;

export interface RowOverrides {
  tokensPerRank?: number;
  globalTokens?: number;
  stageUnavailable?: boolean;
  stageZeroBytes?: boolean;
}

export interface ShardOverrides {
  caseId?: string;
  variant?: string;
  sku?: string;
  backend?: string;
  implName?: string;
  ep?: number;
  phase?: string;
  /** null models a pre-LL artifact: no mode field (the case_id keeps `normal`). */
  mode?: string | null;
  /** null models a pre-FP8 artifact: no precision field and no case_id suffix. */
  precision?: string | null;
  scaleUpTransport?: string;
  scaleOutTransport?: string | null;
  topologyClass?: string;
  nodes?: number;
  gpusPerNode?: number;
  scaleUpDomain?: number;
  vendor?: string;
  workload?: string;
  ladder?: string;
  status?: string;
  reasons?: string[];
  rows?: RowOverrides[];
}

function percentiles(base: number): Json {
  return { p50: base, p90: base * 1.08, p95: base * 1.12, p99: base * 1.2 };
}

function component(base: number): Json {
  return { availability: 'measured', percentiles_us: percentiles(base) };
}

// `total` defaults to the activation count (the bf16 case, where there are no
// scale bytes). Dispatch under FP8 carries extra scale bytes, so its total
// exceeds activation — the fixture models that so tests can prove the payload
// rate reads total_logical_bytes rather than activation_data_bytes.
function bytes(activation: number, total: number = activation): Json {
  return { activation_data_bytes: activation, total_logical_bytes: total };
}

function makeRawRow(index: number, row: RowOverrides, worldSize: number): Json {
  const tokensPerRank = row.tokensPerRank ?? 128 * (index + 1);
  const components: Json = {
    dispatch: component(417 + index),
    combine: component(392 + index),
    roundtrip: component(921 + index),
    stage: row.stageUnavailable
      ? { availability: 'unavailable', percentiles_us: null }
      : component(120 + index),
  };
  // Dispatch total exceeds activation (models FP8 scale bytes); combine is
  // always bf16 (total == activation); roundtrip total is their sum.
  const byteProvenance: Json = {
    dispatch: bytes(384763904, 400000000),
    combine: bytes(384763904),
    roundtrip: bytes(769527808, 784763904),
  };
  if (!row.stageUnavailable) {
    byteProvenance.stage = bytes(row.stageZeroBytes ? 0 : 192381952);
  }
  return {
    tokens_per_rank: tokensPerRank,
    global_tokens: row.globalTokens ?? tokensPerRank * worldSize,
    token_rate_at_latency_percentile: percentiles(8_338_218),
    components,
    byte_provenance: byteProvenance,
  };
}

function makeRawCase(options: ShardOverrides, caseId: string): Json {
  const phase = options.phase === 'prefill' ? 'prefill' : 'decode';
  return {
    case_id: caseId,
    backend: options.backend ?? 'deepep-v2',
    ep: options.ep ?? 8,
    gpus_per_node: options.gpusPerNode ?? 8,
    ladder: options.ladder ?? TOKEN_LADDERS[phase],
    nodes: options.nodes ?? 1,
    ...(options.mode === null ? {} : { mode: options.mode ?? 'normal' }),
    phase,
    ...(options.precision === null ? {} : { precision: options.precision ?? 'bf16' }),
    topology_class: options.topologyClass ?? 'h200-nvlink-island',
    scale_up_domain: options.scaleUpDomain ?? 8,
    scale_up_transport: options.scaleUpTransport ?? 'nvlink',
    scale_out_transport: options.scaleOutTransport ?? null,
  };
}

function caseIdOf(options: ShardOverrides = {}): string {
  if (options.caseId) return options.caseId;
  const tail = options.variant ? `-${options.variant}` : '';
  // Pre-LL artifacts (mode: null) still carried `normal` in their case_ids.
  const mode = options.mode === null ? 'normal' : (options.mode ?? 'normal');
  const precision = options.precision === null ? '' : `-${options.precision ?? 'bf16'}`;
  return `${options.sku ?? 'h200-dgxc'}-${options.backend ?? 'deepep-v2'}-${options.workload ?? 'deepseek-v3'}-${mode}-${options.phase ?? 'decode'}-ep${options.ep ?? 8}-uniform${precision}${tail}`;
}

export function makeRawShard(options: ShardOverrides = {}): Json {
  const caseId = caseIdOf(options);
  const sku = options.sku ?? 'h200-dgxc';
  const backend = options.backend ?? 'deepep-v2';
  const phase = options.phase === 'prefill' ? 'prefill' : 'decode';
  const ladder = options.ladder ?? TOKEN_LADDERS[phase];
  const worldSize = (options.nodes ?? 1) * (options.gpusPerNode ?? 8);
  const rows =
    options.rows ?? ladder.split(/\s+/).map((tokens) => ({ tokensPerRank: Number(tokens) }));
  return {
    version: 1,
    record_type: 'case-attempt',
    identity: {
      case_id: caseId,
      case_factors: { sku, case: makeRawCase({ ...options, backend }, caseId) },
    },
    implementation: { name: options.implName ?? backend },
    runtime: { vendor: options.vendor ?? 'nvidia' },
    measurement: { rows: rows.map((row, index) => makeRawRow(index, row, worldSize)) },
    outcome: {
      status: options.status ?? 'success',
      ...(options.reasons ? { reasons: options.reasons } : {}),
    },
  };
}

export function makeInvalidCaseAttempt(options: ShardOverrides = {}): Json {
  return makeRawShard({ status: 'invalid', reasons: ['capability-gate'], ...options });
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
    case: factors.case as Json,
  };
}

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

export interface KvOverrides {
  sku?: string;
  backend?: string;
  fabric?: string;
  workload?: string;
  precision?: string;
  vendor?: string;
  status?: string;
  reasons?: string[];
  disposition?: 'runnable' | 'unsupported';
  reason?: string;
  /** String on purpose by default: the kv entrypoint emitted `version: '1'`. */
  version?: number | string;
  rows?: Partial<KvRowSpec>[];
  omitShard?: boolean;
}

interface KvRowSpec {
  kind: string;
  isl: number;
  page_tokens: number | null;
  batch: number;
  op: string;
  gbps_p50: number;
  latency_p50: number;
  verify_passed: boolean;
}

function makeRawKvRow(spec: Partial<KvRowSpec>): Json {
  const latency = spec.latency_p50 ?? 24.77;
  return {
    kind: spec.kind ?? 'paged',
    preset: 'dsv4',
    isl: spec.isl ?? 32768,
    page_tokens: spec.page_tokens === undefined ? 64 : spec.page_tokens,
    layers: 61,
    page_bytes: spec.kind === 'bulk' ? null : 9216,
    descs: spec.kind === 'bulk' ? 1 : 20302,
    req_bytes: 183000000,
    batch: spec.batch ?? 1,
    op: spec.op ?? 'pull',
    prep_ms: 1.2,
    latency_ms: {
      p50: latency,
      p95: latency * 1.05,
      min: latency * 0.98,
      max: latency * 1.1,
      n: 24,
    },
    gbps_p50: spec.gbps_p50 ?? 7.39,
    verify: { passed: spec.verify_passed ?? true, detail: '' },
  };
}

function kvCaseIdOf(options: KvOverrides): string {
  return `${options.sku ?? 'gb200'}-${options.backend ?? 'nixl'}-${options.workload ?? 'kv-dsv4'}-${options.fabric ?? 'rdma'}-xfer-ep2-paged-${options.precision ?? 'fp8'}`;
}

/**
 * A kv-transfer shard + its matrix requested-case entry. Mirrors the real
 * artifacts: the shard's case carries only the identity factors while the
 * matrix entry carries the full case (isl_ladder, batch_sizes, topology).
 */
export function makeKvFixture(options: KvOverrides = {}): {
  shard: Json | null;
  requested: RequestedCaseSpec;
} {
  const caseId = kvCaseIdOf(options);
  const sku = options.sku ?? 'gb200';
  const identityCase: Json = {
    backend: options.backend ?? 'nixl',
    workload: options.workload ?? 'kv-dsv4',
    mode: options.fabric ?? 'rdma',
    phase: 'xfer',
    ep: 2,
    routing: 'paged',
    precision: options.precision ?? 'fp8',
    suite: 'kv-transfer',
  };
  const rows = options.rows ?? [
    { kind: 'paged', page_tokens: 64, batch: 1 },
    { kind: 'paged', page_tokens: 64, batch: 16, gbps_p50: 15.12, latency_p50: 193.7 },
    { kind: 'paged', page_tokens: 16, batch: 1, gbps_p50: 2.72, latency_p50: 67.3 },
    { kind: 'bulk', page_tokens: null, batch: 1, gbps_p50: 89.41, latency_p50: 2.05 },
  ];
  const shard: Json | null = options.omitShard
    ? null
    : {
        version: options.version ?? '1',
        record_type: 'case-attempt',
        identity: { case_id: caseId, case_factors: { sku, case: identityCase } },
        implementation: { name: options.backend ?? 'nixl' },
        runtime: { vendor: options.vendor ?? 'nvidia' },
        measurement: { rows: rows.map(makeRawKvRow) },
        outcome: {
          status: options.status ?? 'success',
          ...(options.reasons ? { reasons: options.reasons } : {}),
        },
      };
  const requested: RequestedCaseSpec = {
    caseId,
    sku,
    disposition: options.disposition,
    reason: options.reason,
    case: {
      ...identityCase,
      case_id: caseId,
      isl_ladder: '512 4096 32768',
      page_tokens: '16 64',
      batch_sizes: '1 4 16',
      ops: 'pull push',
      nodes: 2,
      gpus_per_node: 1,
      scale_up_domain: 72,
      scope: 'scale-out',
      scale_up_transport: 'mnnvl',
      scale_out_transport: options.fabric ?? 'rdma',
      transport: options.fabric ?? 'rdma',
      topology_class: `${sku}-kv-${options.fabric ?? 'rdma'}`,
    },
  };
  return { shard, requested };
}

export function makeRunMeta(
  overrides: Partial<CollectiveXNeutralRunMeta> = {},
): CollectiveXNeutralRunMeta {
  return {
    run_id: '160',
    run_attempt: 1,
    generated_at: '2026-07-08T12:20:00Z',
    conclusion: 'success',
    source_sha: SOURCE_SHA,
    ...overrides,
  };
}

export function buildDataset(
  options: {
    shards?: Json[];
    requestedCases?: RequestedCaseSpec[];
    kv?: KvOverrides[];
    meta?: Partial<CollectiveXNeutralRunMeta>;
  } = {},
): CollectiveXDataset {
  const shards = options.shards ?? [makeRawShard()];
  const kvFixtures = (options.kv ?? []).map(makeKvFixture);
  const requested = [
    ...shards.map(requestedFromShard),
    ...kvFixtures.map((fixture) => fixture.requested),
    ...(options.requestedCases ?? []),
  ];
  const docs = [...shards, ...kvFixtures.flatMap((fixture) => fixture.shard ?? [])];
  return buildDatasetFromNeutral(makeRawMatrix(requested), docs, makeRunMeta(options.meta));
}

export function makeCollectiveXSeries(overrides: ShardOverrides = {}): CollectiveXSeries {
  return buildDataset({ shards: [makeRawShard(overrides)] }).series[0];
}

export function makeCollectiveXDataset(): CollectiveXDataset {
  const shardA = makeRawShard();
  const shardB = makeRawShard({
    sku: 'mi355x',
    backend: 'mori',
    implName: 'mori',
    vendor: 'amd',
    ep: 16,
    scaleUpTransport: 'xgmi',
    scaleOutTransport: 'rdma',
    topologyClass: 'mi355x-xgmi-rdma',
    nodes: 2,
  });
  // The same cell as shardA measured with FP8 dispatch, so consumers exercise
  // the bf16/fp8 split of an otherwise identical configuration.
  const shardC = makeRawShard({ precision: 'fp8' });
  const unsupportedId = 'b300-deepep-v2-deepseek-v3-normal-decode-ep16-uniform-bf16';
  const pendingId = 'b200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform-bf16';
  return buildDataset({
    shards: [shardA, shardB, shardC],
    requestedCases: [
      {
        caseId: unsupportedId,
        sku: 'b300',
        disposition: 'unsupported',
        reason: 'backend-platform-unsupported',
        case: makeRawCase(
          {
            backend: 'deepep-v2',
            ep: 16,
            nodes: 2,
            scaleOutTransport: 'rdma',
            topologyClass: 'b300-nvlink-rdma',
          },
          unsupportedId,
        ),
      },
      {
        caseId: pendingId,
        sku: 'b200-dgxc',
        case: makeRawCase({ backend: 'deepep-v2', topologyClass: 'b200-nvlink-island' }, pendingId),
      },
    ],
  });
}
