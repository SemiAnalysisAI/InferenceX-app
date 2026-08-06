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
  /**
   * Emit the chained-measurement fields: `components.pair_period`, the
   * per-operation `chain_floor_us`, `chain_health`, and the implementation
   * flag. Off by default so the shared fixtures keep modelling the artifacts
   * that predate the chained schedule.
   */
  chained?: boolean;
  /** Chained period includes the inter-pair barrier (requires `chained`). */
  chainBarrier?: boolean;
  /**
   * Emit the unrelated opt-in `components.period` burst estimator that some
   * backends carry. Independent of `chained` — it is not the chained pair
   * period and must never be read as one.
   */
  burstPeriod?: boolean;
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

function makeRawRow(
  index: number,
  row: RowOverrides,
  worldSize: number,
  chained: boolean,
  burstPeriod: boolean,
): Json {
  const tokensPerRank = row.tokensPerRank ?? 128 * (index + 1);
  const components: Json = {
    dispatch: component(417 + index),
    combine: component(392 + index),
    roundtrip: component(921 + index),
    stage: row.stageUnavailable
      ? { availability: 'unavailable', percentiles_us: null }
      : component(120 + index),
  };
  // Steady state is cheaper than the isolated roundtrip: chaining the pairs
  // overlaps what timing one pair alone serializes.
  if (chained) components.pair_period = component(844 + index);
  // A distinctly different value, so a consumer that confuses the two is caught
  // by the number it reports rather than by luck.
  if (burstPeriod) components.period = component(611 + index);
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
    // No `pair_period` byte provenance: the pair moves the roundtrip's bytes,
    // and the reader is expected to read them from there.
    byte_provenance: byteProvenance,
    // Floors and the spread are component-shaped like the entries above, not
    // bare numbers — a floor can be unavailable on its own.
    ...(chained
      ? {
          chain_floor_us: { dispatch: component(388 + index), combine: component(351 + index) },
          chain_health: { pair_spread_us: component(12 + index) },
        }
      : {}),
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
    implementation: {
      name: options.implName ?? backend,
      ...(options.chained
        ? { chained_period: true, chain_barrier: options.chainBarrier ?? false }
        : {}),
    },
    runtime: { vendor: options.vendor ?? 'nvidia' },
    measurement: {
      rows: rows.map((row, index) =>
        makeRawRow(index, row, worldSize, options.chained === true, options.burstPeriod === true),
      ),
    },
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
    meta?: Partial<CollectiveXNeutralRunMeta>;
  } = {},
): CollectiveXDataset {
  const shards = options.shards ?? [makeRawShard()];
  const requested = [...shards.map(requestedFromShard), ...(options.requestedCases ?? [])];
  return buildDatasetFromNeutral(makeRawMatrix(requested), shards, makeRunMeta(options.meta));
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
