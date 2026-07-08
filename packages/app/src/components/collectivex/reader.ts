import type { ZodError, ZodType } from 'zod';

import {
  collectiveXDatasetSchema,
  collectiveXRawCaseAttemptSchema,
  collectiveXRawMatrixSchema,
  collectiveXRawTerminalSchema,
  collectiveXRunsSchema,
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXAttempt,
  type CollectiveXComponent,
  type CollectiveXCoverage,
  type CollectiveXCoveragePoint,
  type CollectiveXDataset,
  type CollectiveXOutcome,
  type CollectiveXPoint,
  type CollectiveXPrecisionAxis,
  type CollectiveXRawCase,
  type CollectiveXRawCaseAttempt,
  type CollectiveXRawProfile,
  type CollectiveXRawRow,
  type CollectiveXRawTerminal,
  type CollectiveXResolvedDataset,
  type CollectiveXRuns,
  type CollectiveXRunSummary,
  type CollectiveXSeries,
  type CollectiveXTerminalStatus,
  type CollectiveXVersion,
} from './types';

const collectiveXPublicRoot = (version: CollectiveXVersion) => `/collectivex-data/${version}/`;

export const collectiveXRunsUrl = (version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) =>
  `${collectiveXPublicRoot(version)}runs.json`;

export const collectiveXLatestUrl = (version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) =>
  `${collectiveXPublicRoot(version)}latest.json`;

export const collectiveXRunUrl = (version: CollectiveXVersion, runId: string) =>
  `${collectiveXPublicRoot(version)}runs/${runId}.json`;

export type CollectiveXAvailabilityReason = 'source-unavailable' | 'runs-unavailable';

class CollectiveXDataError extends Error {
  readonly availabilityReason: CollectiveXAvailabilityReason | null;

  constructor(message: string, availabilityReason: CollectiveXAvailabilityReason | null = null) {
    super(availabilityReason ? message : `CollectiveX dataset rejected: ${message}`);
    this.name = 'CollectiveXDataError';
    this.availabilityReason = availabilityReason;
  }
}

export function collectiveXAvailabilityReason(
  error: unknown,
): CollectiveXAvailabilityReason | null {
  return error instanceof CollectiveXDataError ? error.availabilityReason : null;
}

function schemaError(error: ZodError, prefix = '$'): CollectiveXDataError {
  const issue = error.issues[0];
  const path = issue?.path.length ? `${prefix}.${issue.path.join('.')}` : prefix;
  if (issue?.code === 'unrecognized_keys') {
    return new CollectiveXDataError(`${path} contains unknown field ${issue.keys[0]}.`);
  }
  return new CollectiveXDataError(`${path} ${issue?.message ?? 'is malformed'}.`);
}

function parseWith<T>(schema: ZodType<T>, value: unknown, prefix: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw schemaError(parsed.error, prefix);
  return parsed.data;
}

// Duplicate-key-rejecting JSON parse: the neutral artifacts and the served view
// datasets must be canonical single-object JSON, so a repeated key is corruption.
function strictJson(text: string, name: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CollectiveXDataError(`${name} is not valid JSON.`);
  }

  let offset = 0;
  const whitespace = () => {
    while (/\s/.test(text[offset] ?? '')) offset += 1;
  };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset)) as string;
      }
      if (text[offset] === '\\') offset += text[offset + 1] === 'u' ? 6 : 2;
      else offset += 1;
    }
    throw new CollectiveXDataError(`${name} contains an unterminated string.`);
  };
  const parseValue = (): void => {
    whitespace();
    if (text[offset] === '{') return object();
    if (text[offset] === '[') return array();
    if (text[offset] === '"') return void string();
    while (offset < text.length && !/[\s,\]}]/.test(text[offset])) offset += 1;
  };
  const object = (): void => {
    const keys = new Set<string>();
    offset += 1;
    whitespace();
    if (text[offset] === '}') return void (offset += 1);
    while (offset < text.length) {
      const key = string();
      if (keys.has(key)) throw new CollectiveXDataError(`${name} contains duplicate key ${key}.`);
      keys.add(key);
      whitespace();
      offset += 1;
      parseValue();
      whitespace();
      if (text[offset] === '}') return void (offset += 1);
      offset += 1;
      whitespace();
    }
  };
  const array = (): void => {
    offset += 1;
    whitespace();
    if (text[offset] === ']') return void (offset += 1);
    while (offset < text.length) {
      parseValue();
      whitespace();
      if (text[offset] === ']') return void (offset += 1);
      offset += 1;
    }
  };
  parseValue();
  return value;
}

// ---------------------------------------------------------------------------
// View dataset parsing (the run-scoped JSON the route serves + the client reads)
// ---------------------------------------------------------------------------
export function parseCollectiveXDataset(value: unknown): CollectiveXDataset {
  return parseWith(collectiveXDatasetSchema, value, '$');
}

export function parseCollectiveXDatasetText(text: string): CollectiveXDataset {
  return parseCollectiveXDataset(strictJson(text, 'dataset'));
}

export function parseCollectiveXRuns(value: unknown, version: CollectiveXVersion): CollectiveXRuns {
  const parsed = parseWith(collectiveXRunsSchema, value, '$');
  if (parsed.version !== version) {
    throw new CollectiveXDataError('$.version does not match the requested version.');
  }
  const runIds = new Set<string>();
  for (const run of parsed.runs) {
    if (runIds.has(run.run_id)) {
      throw new CollectiveXDataError(`$.runs contains duplicate run ${run.run_id}.`);
    }
    runIds.add(run.run_id);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Neutral → view builder
//
// Runs server-side (route.ts) over the raw docs collectivex-github.ts downloaded:
// one collectivex.matrix.v1 doc, plus every collectivex.ep.v1 (case-attempt) and
// collectivex.terminal.v1 (terminal-outcome) doc from the run's shard/unsupported
// artifacts. Assembles the neutral view dataset, deriving the data-rate fields the
// retired publisher used to store. The assembled dataset is validated against the
// view schema before it is returned, so the served JSON is always schema-valid.
// ---------------------------------------------------------------------------
export interface CollectiveXNeutralRunMeta {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  matrix_id: string | null;
  source_bundle_ids: string[];
}

const ACTIVATION_ACCOUNTING = 'activation-data-plus-scales-v1' as const;

function toOutcome(status: string): CollectiveXOutcome {
  switch (status) {
    case 'success':
    case 'unsupported':
    case 'failed':
    case 'invalid':
    case 'diagnostic':
    case 'pending': {
      return status;
    }
    default: {
      return 'failed';
    }
  }
}

function toTerminalStatus(outcome: CollectiveXOutcome): CollectiveXTerminalStatus {
  return outcome === 'success' ? 'measured' : outcome;
}

function ratesFrom(
  bytes: number,
  latency: CollectiveXComponent['latency_us'],
): CollectiveXComponent['activation_data_rate_gbps_at_latency_percentile'] {
  // GB/s at percentile p = bytes / latency_us[p]. bytes/µs = 1e6 B/s = 1e-3 GB/s.
  const rate = (us: number) => (bytes / us) * 1e-3;
  return {
    p50: rate(latency.p50),
    p90: rate(latency.p90),
    p95: rate(latency.p95),
    p99: rate(latency.p99),
  };
}

function mapComponent(
  raw: CollectiveXRawRow['components'][string] | undefined,
  bytes: CollectiveXRawRow['byte_provenance'][string] | undefined,
): CollectiveXComponent | null {
  if (!raw || raw.percentiles_us === null || raw.availability === 'unavailable') return null;
  const latency_us = raw.percentiles_us;
  const origin = raw.origin === 'measured' ? 'measured' : 'derived';
  if (!bytes) {
    return {
      origin,
      latency_us,
      byte_provenance: null,
      activation_data_rate_gbps_at_latency_percentile: null,
      total_logical_data_rate_gbps_at_latency_percentile: null,
      sample_count: raw.sample_count ?? null,
    };
  }
  const byte_provenance = {
    accounting_contract: ACTIVATION_ACCOUNTING,
    activation_data_bytes: bytes.activation_data_bytes,
    scale_bytes: bytes.scale_bytes ?? 0,
    total_logical_bytes: bytes.total_logical_bytes,
  };
  return {
    origin,
    latency_us,
    byte_provenance,
    activation_data_rate_gbps_at_latency_percentile: ratesFrom(
      bytes.activation_data_bytes,
      latency_us,
    ),
    total_logical_data_rate_gbps_at_latency_percentile: ratesFrom(
      bytes.total_logical_bytes,
      latency_us,
    ),
    sample_count: raw.sample_count ?? null,
  };
}

function precisionProfileId(profile: CollectiveXRawProfile): string {
  return `d-${profile.dtype}.c-${profile.combine_dtype}`;
}

function dispatchPrecision(profile: CollectiveXRawProfile): CollectiveXPrecisionAxis {
  return { communication_format: profile.dtype, quant_mode: 'none', semantics: 'dispatch' };
}

function combinePrecision(profile: CollectiveXRawProfile): CollectiveXPrecisionAxis {
  return {
    communication_format: profile.combine_dtype,
    quant_mode: profile.combine_quant_mode ?? 'none',
    semantics: profile.combine_semantics,
  };
}

function caseLabel(sku: string, backend: string, phase: string, ep: number): string {
  return `${sku} · ${backend} · ${phase} · EP${ep}`;
}

// ---------------------------------------------------------------------------
// Neutral-format field synthesis
//
// The neutral MVP backend trimmed several promotion-era identity fields (series_id,
// allocation_id, series_factors, per-row evidence_id) and now emits structured anomaly
// objects. Each helper returns the legacy value when present (the fixtures still carry
// them) and otherwise derives a stable, view-schema-valid substitute.
// ---------------------------------------------------------------------------
function seriesKeyOf(shard: CollectiveXRawCaseAttempt): string {
  // Retries of a case share its case_id, so case_id is the natural series key when no
  // explicit series_id was emitted.
  return shard.identity.series_id ?? shard.identity.case_id;
}

function allocationIdOf(shard: CollectiveXRawCaseAttempt): string {
  const { allocation_id, allocation_factors } = shard.identity;
  if (allocation_id) return allocation_id;
  // One GHA run+attempt is one allocation; derive a stable, safe-id substitute.
  return `alloc-${allocation_factors.run_id}-${allocation_factors.run_attempt}`;
}

function evidenceIdOf(row: CollectiveXRawRow): string {
  // point_id is unique per row, so it yields a unique, safe evidence id.
  return row.evidence_id ?? `ev-${row.point_id}`;
}

function seriesBuild(shard: CollectiveXRawCaseAttempt): CollectiveXSeries['build'] {
  const factors = shard.identity.series_factors;
  const image = shard.provenance?.image;
  return {
    image_digest: factors?.image_digest ?? image?.digest ?? '',
    source_sha:
      factors?.source_sha ??
      shard.identity.allocation_factors.source_sha ??
      shard.provenance?.git_run?.source_sha ??
      '',
    squash_sha256: factors?.squash_sha256 ?? image?.squash_sha256 ?? '',
  };
}

function anomalyReasonId(anomaly: string | Record<string, unknown>): string {
  const raw =
    typeof anomaly === 'string'
      ? anomaly
      : typeof anomaly.type === 'string'
        ? anomaly.type
        : 'anomaly';
  const slug = raw
    .toLowerCase()
    .replaceAll(/[^a-z0-9.-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 96);
  return slug.length > 0 ? slug : 'anomaly';
}

function mapAnomalies(anomalies: CollectiveXRawRow['anomalies']): string[] {
  if (!anomalies) return [];
  const seen = new Set<string>();
  for (const anomaly of anomalies) {
    seen.add(anomalyReasonId(anomaly));
    if (seen.size >= 16) break;
  }
  return [...seen];
}

function mapPoint(row: CollectiveXRawRow): CollectiveXPoint {
  return {
    point_id: row.point_id,
    tokens_per_rank: row.tokens_per_rank,
    global_tokens: row.global_tokens,
    anomalies: mapAnomalies(row.anomalies),
    correctness: {
      passed: row.correctness.passed,
      max_relative_error: row.correctness.max_relative_error,
      contract: row.correctness.contract,
      scope: row.correctness.scope,
    },
    routing: {
      fanout_mean: row.routing.fanout_mean,
      routed_copies: row.routing.routed_copies,
      recv_tokens_max: row.receive.max,
      expert_load_cv: row.routing.expert_load_cv,
      payload_rank_cv: row.routing.payload_rank_cv,
      hotspot_ratio: row.routing.hotspot_ratio,
      empty_expert_count: row.routing.empty_expert_count,
      empty_rank_count: row.routing.empty_rank_count,
    },
    components: {
      dispatch: mapComponent(row.components.dispatch, row.byte_provenance.dispatch),
      stage: mapComponent(row.components.stage, row.byte_provenance.stage),
      combine: mapComponent(row.components.combine, row.byte_provenance.combine),
      roundtrip: mapComponent(row.components.roundtrip, row.byte_provenance.roundtrip),
      isolated_sum: mapComponent(row.components.isolated_sum, row.byte_provenance.isolated_sum),
    },
    roundtrip_token_rate_at_latency_percentile: row.token_rate_at_latency_percentile,
    evidence_ids: [evidenceIdOf(row)],
  };
}

function buildSeries(shard: CollectiveXRawCaseAttempt): CollectiveXSeries {
  const { identity, topology, implementation, measurement, runtime_fingerprint } = shard;
  const kase = identity.case_factors.case;
  const profile = identity.case_factors.profile;
  const sku = identity.case_factors.sku;
  const vendor = runtime_fingerprint.vendor === 'amd' ? 'amd' : 'nvidia';
  return {
    series_id: seriesKeyOf(shard),
    label: caseLabel(sku, kase.backend, kase.phase, kase.ep),
    allocation_ids: [allocationIdOf(shard)],
    model: kase.workload,
    suite: kase.suite,
    mode: kase.mode === 'low-latency' ? 'low-latency' : 'normal',
    phase: kase.phase === 'prefill' ? 'prefill' : 'decode',
    backend: {
      id: identity.series_factors?.backend ?? kase.backend,
      label: implementation.name,
      generation: implementation.provenance.backend_lineage ?? null,
      version: implementation.provenance.deepep_version ?? null,
    },
    build: seriesBuild(shard),
    system: {
      sku,
      label: topology.device_product ?? sku,
      vendor,
      topology_class: topology.topology_class,
      transport: topology.transport,
      scale_up_transport: topology.scale_up_transport,
      scale_out_transport: topology.scale_out_transport,
      scope: topology.scope === 'scale-out' ? 'scale-out' : 'scale-up',
      nodes: topology.nodes,
      gpus_per_node: topology.gpus_per_node,
      scale_up_domain: topology.scale_up_domain,
      world_size: topology.world_size,
      ep_size: kase.ep,
      placement: topology.placement,
    },
    workload: {
      workload_id: identity.series_factors?.workload_id ?? kase.workload,
      hidden: kase.hidden,
      top_k: kase.topk,
      experts: kase.experts,
      routing: kase.routing === 'zipf' ? 'zipf' : 'uniform',
      eplb: kase.eplb,
      precision_profile: precisionProfileId(profile),
      dispatch_precision: dispatchPrecision(profile),
      combine_precision: combinePrecision(profile),
      activation_profile: profile.activation_profile,
    },
    eplb: {
      enabled: kase.eplb,
      planner: profile.eplb_planner ?? null,
      logical_experts: kase.experts,
      physical_experts: null,
      redundant_experts: profile.eplb_redundant_experts ?? 0,
      reference_tokens_per_rank: profile.eplb_reference_tokens_per_rank ?? null,
      replicated_experts: null,
      max_replicas: null,
      imbalance_before: null,
      imbalance_after: null,
      mapping_sha256: null,
    },
    resource: {
      mode: profile.resource_mode ?? 'fixed-profile',
      profile: implementation.resource_profile.resource_class ?? 'fixed-profile',
      comm_units_kind: implementation.resource_profile.comm_units_kind ?? null,
      configured_units: implementation.resource_profile.configured_units ?? null,
    },
    measurement: {
      contract: measurement.contract,
      combine_semantics: profile.combine_semantics,
      payload_unit: profile.payload_unit,
      iters: measurement.sampling.iterations_per_trial,
      trials: measurement.sampling.trials,
      warmups: measurement.sampling.warmup_iterations,
      samples_per_component: measurement.sampling.samples_per_component,
    },
    points: measurement.rows.map((row) => mapPoint(row)),
  };
}

function successAttempt(shard: CollectiveXRawCaseAttempt): CollectiveXAttempt {
  const { identity } = shard;
  return {
    attempt_id: identity.attempt_id,
    case_id: identity.case_id,
    allocation_id: allocationIdOf(shard),
    run_id: identity.allocation_factors.run_id,
    run_attempt: Number(identity.allocation_factors.run_attempt) || 1,
    attempt_index: identity.attempt_ordinal,
    outcome: 'success',
    failure_mode: null,
    reason: null,
    selected: true,
    evidence: shard.measurement.rows.map((row) => ({
      evidence_id: evidenceIdOf(row),
      point_id: row.point_id,
    })),
  };
}

function terminalAttempt(doc: CollectiveXRawTerminal): CollectiveXAttempt | null {
  const { identity, outcome } = doc;
  const attemptId = identity.attempt_id;
  const caseId = identity.case_id;
  const allocationId = identity.allocation_id;
  const runId = identity.allocation_factors?.run_id;
  // Terminal docs from the capability resolver carry full-format IDs; only emit an
  // attempt when they are all present, otherwise the coverage row records the outcome.
  if (!attemptId || !caseId || !allocationId || !runId) return null;
  const mapped = toOutcome(outcome.status);
  return {
    attempt_id: attemptId,
    case_id: caseId,
    allocation_id: allocationId,
    run_id: runId,
    run_attempt: Number(identity.allocation_factors?.run_attempt) || 1,
    attempt_index: identity.attempt_ordinal ?? 1,
    outcome: mapped,
    failure_mode: outcome.failure_mode ?? null,
    reason: outcome.reason ?? outcome.failure_mode ?? null,
    selected: true,
    evidence: [],
  };
}

function ladderTokens(kase: CollectiveXRawCase): number[] {
  const world = kase.nodes * kase.gpus_per_node;
  const tokens = kase.ladder
    .split(/\s+/)
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return tokens.length > 0 ? tokens : [world];
}

function measuredCoveragePoints(shard: CollectiveXRawCaseAttempt): CollectiveXCoveragePoint[] {
  return shard.measurement.rows.map((row) => ({
    point_id: row.point_id,
    series_id: seriesKeyOf(shard),
    tokens_per_rank: row.tokens_per_rank,
    global_tokens: row.global_tokens,
    terminal_status: 'measured' as const,
    reason: null,
  }));
}

function terminalCoveragePoints(
  kase: CollectiveXRawCase,
  status: CollectiveXTerminalStatus,
  reason: string,
): CollectiveXCoveragePoint[] {
  const world = kase.nodes * kase.gpus_per_node;
  return ladderTokens(kase).map((tokens) => ({
    point_id: null,
    series_id: null,
    tokens_per_rank: tokens,
    global_tokens: tokens * world,
    terminal_status: status,
    reason,
  }));
}

export function buildDatasetFromNeutral(
  matrixRaw: unknown,
  docs: unknown[],
  run: CollectiveXNeutralRunMeta,
): CollectiveXDataset {
  const matrix = parseWith(collectiveXRawMatrixSchema, matrixRaw, 'matrix');

  const shards: CollectiveXRawCaseAttempt[] = [];
  const terminals: CollectiveXRawTerminal[] = [];
  for (const doc of docs) {
    const format = (doc as { format?: unknown } | null)?.format;
    if (format === 'collectivex.ep.v1') {
      shards.push(parseWith(collectiveXRawCaseAttemptSchema, doc, 'shard'));
    } else if (format === 'collectivex.terminal.v1') {
      terminals.push(parseWith(collectiveXRawTerminalSchema, doc, 'terminal'));
    }
    // Other formats (e.g. collectivex.samples.v1 raw sample dumps) are ignored.
  }

  const successShards = shards.filter((shard) => shard.outcome.status === 'success');
  const seriesByCaseId = new Map<string, CollectiveXRawCaseAttempt>();
  for (const shard of successShards) {
    if (!seriesByCaseId.has(shard.identity.case_id)) {
      seriesByCaseId.set(shard.identity.case_id, shard);
    }
  }
  const terminalsByCaseId = new Map<string, CollectiveXRawTerminal>();
  for (const doc of terminals) {
    const caseId = doc.identity.case_id;
    if (caseId && !terminalsByCaseId.has(caseId)) terminalsByCaseId.set(caseId, doc);
  }

  // Series: one per distinct successful series key (retries of a case share it).
  const seriesById = new Map<string, CollectiveXSeries>();
  for (const shard of successShards) {
    const key = seriesKeyOf(shard);
    if (!seriesById.has(key)) {
      seriesById.set(key, buildSeries(shard));
    }
  }

  // Attempts: every success shard and every terminal doc with full-format IDs.
  const attempts: CollectiveXAttempt[] = [];
  for (const shard of successShards) attempts.push(successAttempt(shard));
  for (const doc of terminals) {
    const attempt = terminalAttempt(doc);
    if (attempt) attempts.push(attempt);
  }
  const attemptsByCaseId = new Map<string, CollectiveXAttempt[]>();
  for (const attempt of attempts) {
    attemptsByCaseId.set(attempt.case_id, [
      ...(attemptsByCaseId.get(attempt.case_id) ?? []),
      attempt,
    ]);
  }

  // Coverage: one row per requested matrix case, joined by case_id.
  const coverage: CollectiveXCoverage[] = [];
  for (const requested of matrix.requested_cases) {
    const kase = requested.case;
    const caseId = kase.case_id;
    if (!caseId) continue;
    const shard = seriesByCaseId.get(caseId);
    const terminal = terminalsByCaseId.get(caseId);
    const caseAttempts = attemptsByCaseId.get(caseId) ?? [];
    const attemptIds = caseAttempts.map((attempt) => attempt.attempt_id);

    let outcome: CollectiveXOutcome;
    let points: CollectiveXCoveragePoint[];
    let selectedAttemptId: string | null;
    let failureMode: string | null;
    let reason: string | null;

    if (shard) {
      outcome = 'success';
      points = measuredCoveragePoints(shard);
      selectedAttemptId = shard.identity.attempt_id;
      failureMode = null;
      reason = null;
    } else if (terminal) {
      outcome = toOutcome(terminal.outcome.status);
      reason = terminal.outcome.reason ?? terminal.outcome.failure_mode ?? 'unspecified';
      points = terminalCoveragePoints(kase, toTerminalStatus(outcome), reason);
      selectedAttemptId = terminal.identity.attempt_id ?? null;
      failureMode = terminal.outcome.failure_mode ?? null;
    } else {
      outcome = 'pending';
      reason = 'pending';
      points = terminalCoveragePoints(kase, 'pending', reason);
      selectedAttemptId = null;
      failureMode = null;
    }

    const profile = shard?.identity.case_factors.profile;
    coverage.push({
      case_id: caseId,
      label: caseLabel(requested.sku, kase.backend, kase.phase, kase.ep),
      disposition: requested.disposition,
      sku: requested.sku,
      backend: kase.backend,
      backend_generation: shard?.implementation.provenance.backend_lineage ?? null,
      mode: kase.mode === 'low-latency' ? 'low-latency' : 'normal',
      phase: kase.phase === 'prefill' ? 'prefill' : 'decode',
      routing: kase.routing === 'zipf' ? 'zipf' : 'uniform',
      eplb: kase.eplb,
      precision_profile: profile ? precisionProfileId(profile) : null,
      dispatch_precision: profile ? dispatchPrecision(profile) : null,
      combine_precision: profile ? combinePrecision(profile) : null,
      resource: {
        mode: profile?.resource_mode ?? null,
        profile: shard?.implementation.resource_profile.resource_class ?? null,
        comm_units_kind: shard?.implementation.resource_profile.comm_units_kind ?? null,
        configured_units: shard?.implementation.resource_profile.configured_units ?? null,
      },
      topology: {
        ep_size: kase.ep,
        nodes: kase.nodes,
        gpus_per_node: kase.gpus_per_node,
        scale_up_domain: kase.scale_up_domain,
        scope: kase.scope === 'scale-out' ? 'scale-out' : 'scale-up',
        scale_up_transport: kase.scale_up_transport,
        scale_out_transport: kase.scale_out_transport,
        transport: kase.transport,
        topology_class: kase.topology_class,
      },
      points,
      selected_attempt_id: selectedAttemptId,
      outcome,
      failure_mode: failureMode,
      reason,
      attempt_ids: [...new Set(attemptIds)],
    });
  }

  const series = [...seriesById.values()];
  const coveragePoints = coverage.flatMap((item) => item.points);
  const measuredCases = coverage.filter((item) => item.outcome === 'success').length;
  const unsupportedCases = coverage.filter((item) => item.outcome === 'unsupported').length;
  const failedCases = coverage.filter((item) =>
    ['failed', 'invalid', 'diagnostic'].includes(item.outcome),
  ).length;
  const terminalCases = coverage.filter((item) => item.outcome !== 'pending').length;
  const measuredPoints = coveragePoints.filter(
    (point) => point.terminal_status === 'measured',
  ).length;
  const terminalPoints = coveragePoints.filter(
    (point) => point.terminal_status !== 'pending',
  ).length;

  const dataset: CollectiveXDataset = {
    format: 'collectivex.view.v1',
    schema_version: 1,
    generated_at: run.generated_at,
    source_bundle_ids: [...new Set(run.source_bundle_ids)].toSorted(),
    run: {
      run_id: run.run_id,
      run_attempt: run.run_attempt,
      generated_at: run.generated_at,
      conclusion: run.conclusion,
      matrix_id: run.matrix_id,
      requested_cases: coverage.length,
      terminal_cases: terminalCases,
      measured_cases: measuredCases,
      unsupported_cases: unsupportedCases,
      failed_cases: failedCases,
      requested_points: coveragePoints.length,
      terminal_points: terminalPoints,
      measured_points: measuredPoints,
      allocation_count: new Set(attempts.map((attempt) => attempt.allocation_id)).size,
      covered_skus: [...new Set(coverage.map((item) => item.sku))].toSorted(),
    },
    coverage,
    attempts,
    series,
  };
  return parseCollectiveXDataset(dataset);
}

export function buildRunSummary(dataset: CollectiveXDataset): CollectiveXRunSummary {
  return {
    run_id: dataset.run.run_id,
    run_attempt: dataset.run.run_attempt,
    generated_at: dataset.run.generated_at,
    conclusion: dataset.run.conclusion,
    covered_skus: dataset.run.covered_skus,
    terminal_counts: {
      measured: dataset.run.measured_cases,
      unsupported: dataset.run.unsupported_cases,
      failed: dataset.run.failed_cases,
    },
  };
}

// ---------------------------------------------------------------------------
// Client fetch helpers (run-scoped view endpoints)
// ---------------------------------------------------------------------------
async function responseOrThrow(url: string, options: RequestInit, name: string): Promise<Response> {
  const response = await fetch(url, options);
  if (response.ok) return response;
  if (response.status === 503) {
    throw new CollectiveXDataError('source-unavailable', 'source-unavailable');
  }
  if (response.status === 404) {
    throw new CollectiveXDataError('runs-unavailable', 'runs-unavailable');
  }
  throw new CollectiveXDataError(`${name} request failed (${response.status}).`);
}

function resolved(dataset: CollectiveXDataset): CollectiveXResolvedDataset {
  return { dataset, run_id: dataset.run.run_id, run_attempt: dataset.run.run_attempt };
}

export async function fetchCollectiveXLatest(
  signal?: AbortSignal,
  version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION,
): Promise<CollectiveXResolvedDataset> {
  const response = await responseOrThrow(
    collectiveXLatestUrl(version),
    { cache: 'no-store', credentials: 'same-origin', signal },
    'dataset',
  );
  return resolved(parseCollectiveXDatasetText(await response.text()));
}

export async function fetchCollectiveXByRunId(
  version: CollectiveXVersion,
  runId: string,
  signal?: AbortSignal,
): Promise<CollectiveXResolvedDataset> {
  if (!/^[1-9][0-9]*$/.test(runId)) {
    throw new CollectiveXDataError('a run id must be a positive integer.');
  }
  const response = await responseOrThrow(
    collectiveXRunUrl(version, runId),
    { cache: 'force-cache', credentials: 'same-origin', signal },
    'dataset',
  );
  return resolved(parseCollectiveXDatasetText(await response.text()));
}

export async function fetchCollectiveXRuns(
  version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION,
  signal?: AbortSignal,
): Promise<CollectiveXRunSummary[]> {
  const response = await responseOrThrow(
    collectiveXRunsUrl(version),
    { cache: 'no-store', credentials: 'same-origin', signal },
    'runs',
  );
  const runs = parseCollectiveXRuns(strictJson(await response.text(), 'runs'), version);
  return runs.runs;
}

export { CollectiveXDataError };
