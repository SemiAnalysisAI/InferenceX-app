/**
 * CollectiveX neutral-contract reader: assembles the dashboard dataset from a
 * sweep run's raw matrix + case-attempt docs. Shared by the ingest script
 * (validation + summary precompute) and the app's API routes (assembly at
 * read time), so the transform can never drift between the two.
 *
 * The sweep JSON contract is expected to change; when it does, update this
 * reader (and bump the `version` tag in the harness's sweep config). Raw docs
 * are stored untouched in the DB, so reader fixes retroactively apply to
 * already-ingested runs.
 */

import type {
  CollectiveXComponent,
  CollectiveXCoverage,
  CollectiveXCoveragePoint,
  CollectiveXDataset,
  CollectiveXKvCase,
  CollectiveXKvLatency,
  CollectiveXKvRow,
  CollectiveXMode,
  CollectiveXOutcome,
  CollectiveXPercentiles,
  CollectiveXPoint,
  CollectiveXPrecision,
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
  mode?: string;
  phase: string;
  precision?: string;
  topology_class: string;
  scale_up_domain: number;
  scale_up_transport: string;
  scale_out_transport: string | null;
  /** `kv-transfer` on KV handoff cases; absent on EP cases. */
  suite?: string;
  /** KV workload preset name (e.g. `kv-dsv4`); absent on EP cases. */
  workload?: string;
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
  byte_provenance: Record<string, { activation_data_bytes: number; total_logical_bytes?: number }>;
}

// KV shards report per-burst rows instead of per-ladder-token rows; the two
// families share the shard envelope and are told apart by `case.suite`.
interface RawKvRow {
  kind: string;
  isl: number;
  page_tokens: number | null;
  batch?: number;
  op: string;
  descs: number;
  req_bytes: number;
  prep_ms?: number;
  latency_ms: CollectiveXKvLatency;
  gbps_p50: number;
  verify?: { passed: boolean; detail?: string };
}

interface RawShard {
  /** Numeric in EP artifacts; the kv entrypoint emitted it as a string. */
  version: number | string;
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

type CollectiveXVendor = CollectiveXSeries['system']['vendor'];

interface SupportedShard {
  shard: RawShard;
  vendor: CollectiveXVendor;
}

export interface CollectiveXNeutralRunMeta {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  source_sha: string;
}

function toSupportedVendor(raw: string): CollectiveXVendor | null {
  const vendor = raw.trim().toLowerCase();
  return vendor === 'amd' || vendor === 'nvidia' ? vendor : null;
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

// Artifacts predating the FP8 dispatch dimension carry no precision field and
// were all measured in bf16.
function toPrecision(raw: string | undefined): CollectiveXPrecision {
  return raw === 'fp8' ? 'fp8' : 'bf16';
}

// Artifacts predating the low-latency kernel dimension carry no mode field
// and were all measured with the normal (throughput) kernels.
function toMode(raw: string | undefined): CollectiveXMode {
  return raw === 'low-latency' ? 'low-latency' : 'normal';
}

// GB/s = bytes / (latency_us * 1e-6) / 1e9 = (bytes / latency_us) * 1e-3. `divisor`
// splits an aggregate world byte count into a per-GPU figure (divisor = ep_size).
function ratesFrom(
  bytes: number,
  latency: CollectiveXPercentiles,
  divisor = 1,
): CollectiveXPercentiles {
  const rate = (us: number) => (bytes / divisor / us) * 1e-3;
  return {
    p50: rate(latency.p50),
    p90: rate(latency.p90),
    p95: rate(latency.p95),
    p99: rate(latency.p99),
  };
}

function mapComponent(
  raw: RawComponent | null | undefined,
  bytes: { activation_data_bytes: number; total_logical_bytes?: number } | undefined,
  ep: number,
): CollectiveXComponent | null {
  if (!raw?.percentiles_us || raw.availability === 'unavailable') return null;
  // Byte counts are aggregate across the EP world (routed_copies = fanout.sum()).
  // Activation rate stays aggregate (unchanged); payload rate is per-GPU over the
  // full logical payload, falling back to activation bytes for pre-provenance
  // artifacts that carry no total_logical_bytes.
  const payloadBytes = bytes ? (bytes.total_logical_bytes ?? bytes.activation_data_bytes) : null;
  return {
    latency_us: raw.percentiles_us,
    activation_data_rate_gbps_at_latency_percentile: bytes
      ? ratesFrom(bytes.activation_data_bytes, raw.percentiles_us)
      : null,
    payload_data_rate_gbps_at_latency_percentile:
      payloadBytes === null ? null : ratesFrom(payloadBytes, raw.percentiles_us, Math.max(1, ep)),
    payload_bytes: payloadBytes,
  };
}

function mapPoint(row: RawRow, ep: number): CollectiveXPoint {
  const component = (name: string) =>
    mapComponent(row.components[name], row.byte_provenance[name], ep);
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

function buildSeries({ shard, vendor }: SupportedShard): CollectiveXSeries {
  const kase = shard.identity.case_factors.case;
  return {
    series_id: shard.identity.case_id,
    phase: kase.phase === 'prefill' ? 'prefill' : 'decode',
    mode: toMode(kase.mode),
    precision: toPrecision(kase.precision),
    backend: shard.implementation.name,
    system: {
      ...topologyOf(kase),
      sku: shard.identity.case_factors.sku,
      vendor,
    },
    points: shard.measurement.rows.map((row) => mapPoint(row, kase.ep)),
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
  // null when the shard measured nothing. `Math.max()` of an empty list is
  // -Infinity, which would put every ladder point above the largest measured
  // value and report a backend token-capacity limit that was never observed —
  // an unmeasured case would read as a hard capability wall.
  const largestMeasured = rows.size > 0 ? Math.max(...rows.keys()) : null;
  return ladderTokens(kase).map((tokens) => {
    const row = rows.get(tokens);
    if (row) {
      return {
        tokens_per_rank: tokens,
        global_tokens: row.global_tokens,
        terminal_status: 'measured' as const,
        reason: null,
      };
    }
    // Only a point beyond something we actually measured is evidence of a capacity limit.
    const beyondCapacity = largestMeasured !== null && tokens > largestMeasured;
    return {
      tokens_per_rank: tokens,
      global_tokens: tokens * kase.ep,
      terminal_status: beyondCapacity ? ('unsupported' as const) : ('pending' as const),
      reason: beyondCapacity ? 'backend-token-capacity' : 'not-measured',
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

function isKvCase(kase: RawCase): boolean {
  return kase.suite === 'kv-transfer';
}

function mapKvRow(row: RawKvRow): CollectiveXKvRow {
  return {
    kind: row.kind === 'bulk' ? 'bulk' : 'paged',
    isl: row.isl,
    page_tokens: row.page_tokens ?? null,
    // Rows predating the batch dimension measured one request per burst.
    batch: row.batch ?? 1,
    op: row.op === 'push' ? 'push' : 'pull',
    descs: row.descs,
    req_bytes: row.req_bytes,
    prep_ms: row.prep_ms ?? 0,
    latency_ms: row.latency_ms,
    gbps_p50: row.gbps_p50,
    verify_passed: row.verify?.passed ?? true,
  };
}

function buildKvCases(
  requestedCases: RawMatrix['requested_cases'],
  successful: Map<string, SupportedShard>,
  terminal: Map<string, SupportedShard>,
  hiddenCaseIds: Set<string>,
): CollectiveXKvCase[] {
  return requestedCases.flatMap((requested) => {
    const kase = requested.case;
    const caseId = kase.case_id;
    if (!isKvCase(kase) || !caseId || hiddenCaseIds.has(caseId)) return [];
    const measured = successful.get(caseId);
    const failed = terminal.get(caseId);
    let outcome: CollectiveXOutcome;
    let reason: string | null;
    if (measured) {
      outcome = 'success';
      reason = null;
    } else if (failed) {
      outcome = toOutcome(failed.shard.outcome.status);
      reason = reasonId(failed.shard.outcome.reasons?.[0] ?? outcome);
    } else if (requested.disposition === 'unsupported') {
      outcome = 'unsupported';
      reason = reasonId(requested.reason ?? outcome);
    } else {
      outcome = 'pending';
      reason = 'pending';
    }
    const fabric = kase.mode ?? 'rdma';
    const workload = kase.workload ?? 'kv';
    const precision = toPrecision(kase.precision);
    const shard = measured ?? failed;
    return [
      {
        case_id: caseId,
        label: `${requested.sku} · ${kase.backend} · ${fabric} · ${workload} · ${precision}`,
        disposition: requested.disposition,
        sku: requested.sku,
        vendor: shard?.vendor ?? null,
        backend: kase.backend,
        fabric,
        workload,
        precision,
        topology: topologyOf(kase),
        outcome,
        reason,
        detail: requested.detail ?? null,
        rows: measured
          ? (measured.shard.measurement.rows as unknown as RawKvRow[]).map(mapKvRow)
          : [],
      },
    ];
  });
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
    if (Number(shard.version) !== matrix.version) throw new Error('CollectiveX version mismatch');
    return [shard];
  });
  const supportedShards = shards.flatMap((shard): SupportedShard[] => {
    const vendor = toSupportedVendor(shard.runtime.vendor);
    return vendor ? [{ shard, vendor }] : [];
  });
  const supportedCaseIds = new Set(supportedShards.map(({ shard }) => shard.identity.case_id));
  const hiddenCaseIds = new Set(
    shards
      .filter(
        (shard) =>
          !toSupportedVendor(shard.runtime.vendor) && !supportedCaseIds.has(shard.identity.case_id),
      )
      .map((shard) => shard.identity.case_id),
  );
  const successful = new Map<string, SupportedShard>();
  const terminal = new Map<string, SupportedShard>();
  for (const supported of supportedShards) {
    const { shard } = supported;
    const target = shard.outcome.status === 'success' ? successful : terminal;
    if (!target.has(shard.identity.case_id)) target.set(shard.identity.case_id, supported);
  }

  const coverage: CollectiveXCoverage[] = matrix.requested_cases.flatMap((requested) => {
    const kase = requested.case;
    const caseId = kase.case_id;
    if (isKvCase(kase) || !caseId || hiddenCaseIds.has(caseId)) return [];
    const measured = successful.get(caseId)?.shard;
    const failed = terminal.get(caseId)?.shard;
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
    const mode = toMode(kase.mode);
    const precision = toPrecision(kase.precision);
    return [
      {
        case_id: caseId,
        label: `${requested.sku} · ${kase.backend} · ${mode} · ${kase.phase} · EP${kase.ep} · ${precision}`,
        disposition: requested.disposition,
        sku: requested.sku,
        backend: kase.backend,
        phase: kase.phase === 'prefill' ? 'prefill' : 'decode',
        mode,
        precision,
        topology: topologyOf(kase),
        points,
        outcome,
        reason,
        detail: requested.detail ?? null,
      },
    ];
  });
  const kv = buildKvCases(matrix.requested_cases, successful, terminal, hiddenCaseIds);
  const points = coverage.flatMap((item) => item.points);
  // KV cases count into the run's case totals (the run picker's visibility
  // gate is `requested_cases > 0`, and a kv-only sweep is a real run), but
  // carry no ladder points — point totals stay EP-only.
  return {
    version: matrix.version,
    run: {
      ...run,
      requested_cases: coverage.length + kv.length,
      terminal_cases:
        coverage.filter((item) => item.points.every((point) => point.terminal_status !== 'pending'))
          .length + kv.filter((item) => item.outcome !== 'pending').length,
      measured_cases:
        coverage.filter((item) => item.outcome === 'success').length +
        kv.filter((item) => item.outcome === 'success').length,
      unsupported_cases:
        coverage.filter((item) => item.outcome === 'unsupported').length +
        kv.filter((item) => item.outcome === 'unsupported').length,
      failed_cases:
        coverage.filter((item) => ['failed', 'invalid', 'diagnostic'].includes(item.outcome))
          .length +
        kv.filter((item) => ['failed', 'invalid', 'diagnostic'].includes(item.outcome)).length,
      requested_points: points.length,
      terminal_points: points.filter((point) => point.terminal_status !== 'pending').length,
      measured_points: points.filter((point) => point.terminal_status === 'measured').length,
      covered_skus: [
        ...new Set([...coverage.map((item) => item.sku), ...kv.map((item) => item.sku)]),
      ].toSorted(),
      kv_requested_cases: kv.length,
      kv_measured_cases: kv.filter((item) => item.outcome === 'success').length,
    },
    coverage,
    series: [...successful.values()]
      .filter(({ shard }) => !isKvCase(shard.identity.case_factors.case))
      .map(buildSeries),
    kv,
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
    kv_cases: {
      requested: run.kv_requested_cases ?? 0,
      measured: run.kv_measured_cases ?? 0,
    },
  };
}

/**
 * Structural identity check for the matrix document (it carries no
 * `record_type` tag): requested_cases[] + include[] arrays plus a valid
 * numeric `version` — the content axis the frontend selects on.
 */
export function isMatrixDoc(doc: unknown): boolean {
  const candidate = doc as { requested_cases?: unknown; include?: unknown } | null;
  return (
    Array.isArray(candidate?.requested_cases) &&
    Array.isArray(candidate?.include) &&
    matrixVersion(doc) !== null
  );
}

/** Read the matrix doc's numeric version tag; null when absent or invalid. */
export function matrixVersion(doc: unknown): number | null {
  const value = (doc as { version?: unknown } | null)?.version;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}
