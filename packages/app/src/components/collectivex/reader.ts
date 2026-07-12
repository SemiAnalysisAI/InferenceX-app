import type {
  CollectiveXComponent,
  CollectiveXCoverage,
  CollectiveXCoveragePoint,
  CollectiveXDataset,
  CollectiveXOutcome,
  CollectiveXPercentiles,
  CollectiveXPoint,
  CollectiveXRunSummary,
  CollectiveXSeries,
  CollectiveXTerminalStatus,
} from './types';

interface RawCase {
  case_id?: string;
  backend: string;
  ep: number;
  gpus_per_node: number;
  ladder: string;
  nodes: number;
  phase: string;
  topology_class: string;
  scale_up_domain: number;
  scale_up_transport: string;
  scale_out_transport: string | null;
}

interface RawComponent {
  availability: string;
  percentiles_us: CollectiveXPercentiles | null;
}

interface RawRow {
  tokens_per_rank: number;
  global_tokens: number;
  token_rate_at_latency_percentile: CollectiveXPercentiles;
  components: Record<string, RawComponent | null>;
  byte_provenance: Record<string, { activation_data_bytes: number }>;
}

interface RawShard {
  version: number;
  record_type: 'case-attempt';
  identity: {
    case_id: string;
    case_factors: { sku: string; case: RawCase };
  };
  implementation: { name: string };
  runtime: { vendor: string };
  measurement: { rows: RawRow[] };
  outcome: { status: string; reasons?: string[] };
}

interface RawMatrix {
  version: number;
  requested_cases: {
    case: RawCase;
    sku: string;
    disposition: 'runnable' | 'unsupported';
    reason?: string | null;
    detail?: string | null;
  }[];
}

export interface CollectiveXNeutralRunMeta {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  source_sha: string;
}

function matrixOf(value: unknown): RawMatrix {
  const matrix = value as RawMatrix;
  if (!Number.isSafeInteger(matrix?.version) || !Array.isArray(matrix?.requested_cases)) {
    throw new TypeError('invalid CollectiveX matrix');
  }
  return matrix;
}

function shardOf(value: unknown): RawShard | null {
  if ((value as RawShard | null)?.record_type !== 'case-attempt') return null;
  const shard = value as RawShard;
  if (!shard.identity?.case_id || !Array.isArray(shard.measurement?.rows)) {
    throw new TypeError('invalid CollectiveX shard');
  }
  return shard;
}

function toOutcome(status: string): CollectiveXOutcome {
  return ['success', 'unsupported', 'failed', 'invalid', 'diagnostic', 'pending'].includes(status)
    ? (status as CollectiveXOutcome)
    : 'failed';
}

function toTerminalStatus(outcome: CollectiveXOutcome): CollectiveXTerminalStatus {
  return outcome === 'success' ? 'measured' : outcome;
}

function ratesFrom(bytes: number, latency: CollectiveXPercentiles): CollectiveXPercentiles {
  const rate = (us: number) => (bytes / us) * 1e-3;
  return {
    p50: rate(latency.p50),
    p90: rate(latency.p90),
    p95: rate(latency.p95),
    p99: rate(latency.p99),
  };
}

function mapComponent(
  raw: RawComponent | null | undefined,
  bytes?: { activation_data_bytes: number },
): CollectiveXComponent | null {
  if (!raw?.percentiles_us || raw.availability === 'unavailable') return null;
  return {
    latency_us: raw.percentiles_us,
    activation_data_rate_gbps_at_latency_percentile: bytes
      ? ratesFrom(bytes.activation_data_bytes, raw.percentiles_us)
      : null,
  };
}

function mapPoint(row: RawRow): CollectiveXPoint {
  const component = (name: string) => mapComponent(row.components[name], row.byte_provenance[name]);
  return {
    tokens_per_rank: row.tokens_per_rank,
    global_tokens: row.global_tokens,
    components: {
      dispatch: component('dispatch'),
      stage: component('stage'),
      combine: component('combine'),
      roundtrip: component('roundtrip'),
    },
    roundtrip_token_rate_at_latency_percentile: row.token_rate_at_latency_percentile,
  };
}

function topologyOf(kase: RawCase) {
  return {
    ep_size: kase.ep,
    nodes: kase.nodes,
    gpus_per_node: kase.gpus_per_node,
    scale_up_domain: kase.scale_up_domain,
    scale_up_transport: kase.scale_up_transport,
    scale_out_transport: kase.scale_out_transport,
    topology_class: kase.topology_class,
  };
}

function buildSeries(shard: RawShard): CollectiveXSeries {
  const kase = shard.identity.case_factors.case;
  return {
    series_id: shard.identity.case_id,
    phase: kase.phase === 'prefill' ? 'prefill' : 'decode',
    backend: shard.implementation.name,
    system: {
      ...topologyOf(kase),
      sku: shard.identity.case_factors.sku,
      vendor: shard.runtime.vendor === 'amd' ? 'amd' : 'nvidia',
    },
    points: shard.measurement.rows.map(mapPoint),
  };
}

function ladderTokens(kase: RawCase): number[] {
  const values = kase.ladder
    .split(/\s+/)
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return values.length > 0 ? values : [kase.ep];
}

function reasonId(value: string): string {
  return (
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9.-]+/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .slice(0, 96) || 'unknown'
  );
}

function measuredPoints(shard: RawShard, kase: RawCase): CollectiveXCoveragePoint[] {
  const rows = new Map(shard.measurement.rows.map((row) => [row.tokens_per_rank, row]));
  const largestMeasured = Math.max(...rows.keys());
  return ladderTokens(kase).map((tokens) => {
    const row = rows.get(tokens);
    return row
      ? {
          tokens_per_rank: tokens,
          global_tokens: row.global_tokens,
          terminal_status: 'measured',
          reason: null,
        }
      : {
          tokens_per_rank: tokens,
          global_tokens: tokens * kase.ep,
          terminal_status: tokens > largestMeasured ? 'unsupported' : 'pending',
          reason: tokens > largestMeasured ? 'backend-token-capacity' : 'not-measured',
        };
  });
}

function terminalPoints(
  kase: RawCase,
  status: CollectiveXTerminalStatus,
  reason: string,
): CollectiveXCoveragePoint[] {
  return ladderTokens(kase).map((tokens) => ({
    tokens_per_rank: tokens,
    global_tokens: tokens * kase.ep,
    terminal_status: status,
    reason,
  }));
}

export function buildDatasetFromNeutral(
  matrixRaw: unknown,
  docs: unknown[],
  run: CollectiveXNeutralRunMeta,
): CollectiveXDataset {
  const matrix = matrixOf(matrixRaw);
  const shards = docs.flatMap((doc) => {
    const shard = shardOf(doc);
    if (!shard) return [];
    if (shard.version !== matrix.version) throw new Error('CollectiveX version mismatch');
    return [shard];
  });
  const successful = new Map<string, RawShard>();
  const terminal = new Map<string, RawShard>();
  for (const shard of shards) {
    const target = shard.outcome.status === 'success' ? successful : terminal;
    if (!target.has(shard.identity.case_id)) target.set(shard.identity.case_id, shard);
  }

  const coverage: CollectiveXCoverage[] = matrix.requested_cases.flatMap((requested) => {
    const kase = requested.case;
    const caseId = kase.case_id;
    if (!caseId) return [];
    const measured = successful.get(caseId);
    const failed = terminal.get(caseId);
    let outcome: CollectiveXOutcome;
    let reason: string | null;
    let points: CollectiveXCoveragePoint[];
    if (measured) {
      outcome = 'success';
      reason = null;
      points = measuredPoints(measured, kase);
    } else if (failed) {
      outcome = toOutcome(failed.outcome.status);
      reason = reasonId(failed.outcome.reasons?.[0] ?? outcome);
      points = terminalPoints(kase, toTerminalStatus(outcome), reason);
    } else if (requested.disposition === 'unsupported') {
      outcome = 'unsupported';
      reason = reasonId(requested.reason ?? outcome);
      points = terminalPoints(kase, 'unsupported', reason);
    } else {
      outcome = 'pending';
      reason = 'pending';
      points = terminalPoints(kase, 'pending', reason);
    }
    return [
      {
        case_id: caseId,
        label: `${requested.sku} · ${kase.backend} · ${kase.phase} · EP${kase.ep}`,
        disposition: requested.disposition,
        sku: requested.sku,
        backend: kase.backend,
        phase: kase.phase === 'prefill' ? 'prefill' : 'decode',
        topology: topologyOf(kase),
        points,
        outcome,
        reason,
        detail: requested.detail ?? null,
      },
    ];
  });
  const points = coverage.flatMap((item) => item.points);
  return {
    version: matrix.version,
    run: {
      ...run,
      requested_cases: coverage.length,
      terminal_cases: coverage.filter((item) =>
        item.points.every((point) => point.terminal_status !== 'pending'),
      ).length,
      measured_cases: coverage.filter((item) => item.outcome === 'success').length,
      unsupported_cases: coverage.filter((item) => item.outcome === 'unsupported').length,
      failed_cases: coverage.filter((item) =>
        ['failed', 'invalid', 'diagnostic'].includes(item.outcome),
      ).length,
      requested_points: points.length,
      terminal_points: points.filter((point) => point.terminal_status !== 'pending').length,
      measured_points: points.filter((point) => point.terminal_status === 'measured').length,
      covered_skus: [...new Set(coverage.map((item) => item.sku))].toSorted(),
    },
    coverage,
    series: [...successful.values()].map(buildSeries),
  };
}

export function buildRunSummary(dataset: CollectiveXDataset): CollectiveXRunSummary {
  const { run } = dataset;
  return {
    run_id: run.run_id,
    run_attempt: run.run_attempt,
    generated_at: run.generated_at,
    conclusion: run.conclusion,
    covered_skus: run.covered_skus,
    requested_cases: run.requested_cases,
    measured_cases: run.measured_cases,
    requested_points: run.requested_points,
    terminal_points: run.terminal_points,
    terminal_counts: {
      measured: run.measured_cases,
      unsupported: run.unsupported_cases,
      failed: run.failed_cases,
    },
  };
}
