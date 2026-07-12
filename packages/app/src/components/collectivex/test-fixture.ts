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

function bytes(activation: number): Json {
  return { activation_data_bytes: activation };
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
  const byteProvenance: Json = {
    dispatch: bytes(384763904),
    combine: bytes(384763904),
    roundtrip: bytes(769527808),
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
    phase,
    topology_class: options.topologyClass ?? 'h200-nvlink-island',
    scale_up_domain: options.scaleUpDomain ?? 8,
    scale_up_transport: options.scaleUpTransport ?? 'nvlink',
    scale_out_transport: options.scaleOutTransport ?? null,
  };
}

export function caseIdOf(options: ShardOverrides = {}): string {
  if (options.caseId) return options.caseId;
  const tail = options.variant ? `-${options.variant}` : '';
  return `${options.sku ?? 'h200-dgxc'}-${options.backend ?? 'deepep-v2'}-${options.workload ?? 'deepseek-v3'}-normal-${options.phase ?? 'decode'}-ep${options.ep ?? 8}-uniform${tail}`;
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
  const unsupportedId = 'b300-deepep-v2-deepseek-v3-normal-decode-ep16-uniform';
  const pendingId = 'b200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform';
  return buildDataset({
    shards: [shardA, shardB],
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
