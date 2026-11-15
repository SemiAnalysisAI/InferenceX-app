/**
 * Per-attempt data for SLA Targets, built from what the benchmark client
 * itself recorded: an original AgentX export, or the `request_records` block
 * of a fixed-sequence result (see `slaAttemptsFromRequestRecords`).
 *
 * AgentX inputs are the files the load generator writes for one load point:
 * - `profile_export.jsonl`: one record per attempt that returned.
 * - the harness log (`aiperf.log`, or the same lines in `benchmark.log`): the
 *   only place that states how many requests were issued and how many were
 *   still in flight when the grace period ended. Those attempts are cancelled
 *   without a record, so the jsonl alone under-counts attempts.
 * - `profile_export_aiperf.json`: the count of requests rejected for context
 *   overflow, which are also left out of the jsonl.
 *
 * The output keeps what target evaluation needs and nothing else: latencies of
 * completed attempts, counts of every other outcome, and the accounting facts.
 * It holds no policy decision; `reconcileSlaAccounting` applies the policy when
 * the blob is read, so a policy change needs no re-ingest.
 */

import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  SLA_NOT_RECORDED,
  SLA_TPOT_NOT_APPLICABLE,
  type SlaAccountingInput,
  type SlaAttemptSet,
  type SlaOutcomeCount,
} from '@semianalysisai/inferencex-constants';

/** Bump when extraction changes; a backfill recomputes anything older. */
export const SLA_ATTEMPTS_VERSION = 1;

const PROFILING_PHASE = 'profiling';
const WARMUP_PHASE = 'warmup';
/** The harness's own failure to build a request: issued, never dispatched. */
const PRE_DISPATCH_ERROR = 'CreditProcessingError';
const CLIENT_CANCELLATION_ERROR = 'RequestCancellationError';

export interface SlaAttemptsBlob {
  version: number;
  source: {
    /**
     * `original_export`: built from the AgentX client's own records.
     * `request_records`: built from the block a fixed-sequence client writes.
     * `derived_timeline`: from the app's timeline.
     */
    kind: 'original_export' | 'request_records' | 'derived_timeline';
    /**
     * Whether the harness log was available, and whether the phase ran to
     * completion in it. `not_applicable`: the source states its own counts.
     */
    harnessLog: 'complete' | 'aborted' | 'absent' | 'not_applicable';
    /** Why the run stopped early, as the harness logged it. */
    abortReason: string | null;
    /** Issued-request ids missing below the highest id seen; `null` when records carry no id. */
    sequenceGaps: number | null;
    /** Records that could not be parsed as JSON. */
    unparsedLines: number;
  };
  set: SlaAttemptSet;
  accounting: SlaAccountingInput;
}

// ---------------------------------------------------------------------------
// Harness log
// ---------------------------------------------------------------------------

export interface HarnessPhaseCounters {
  /** Configured dispatch window of the profiling phase, s. */
  configuredWindowS: number | null;
  /** Grace period the harness waited for in-flight requests, s. */
  graceS: number | null;
  /** Requests issued in the profiling phase. */
  sent: number | null;
  /** Requests still in flight when dispatch stopped. */
  inFlightAtWindowEnd: number | null;
  /** Requests that returned, with a success or an error. */
  completed: number | null;
  /** Requests still in flight when the grace period ended, cancelled without a record. */
  cancelled: number | null;
  /** Phase start to phase completion, s. */
  elapsedS: number | null;
  gracePeriodTimeout: boolean | null;
  /** The profiling phase logged its completion line. */
  phaseCompleted: boolean;
  /** Why the harness aborted the run, in its own words, if it did. */
  abortReason: string | null;
}

function count(text: string | undefined): number | null {
  if (text === undefined) return null;
  const value = Number(text.replaceAll(',', ''));
  return Number.isFinite(value) ? value : null;
}

const STARTED = /Phase profiling \(profiling\) started \|.*target: (?<window>[\d.]+)s duration/u;
const SENDING_COMPLETE =
  /Phase profiling \(profiling\) sending complete \| sent=(?<sent>[\d,]+), completed=[\d,]+, in_flight=(?<inFlight>[\d,]+)/u;
const GRACE_WAIT = /'profiling phase credits returned' with timeout of (?<grace>[\d.]+)s/u;
const PHASE_COMPLETE =
  /Phase profiling \(profiling\) complete \| completed=(?<completed>[\d,]+), cancelled=(?<cancelled>[\d,]+).*?elapsed=(?<elapsed>[\d.]+)s(?: \| grace_period_timeout=(?<timeout>True|False))?/u;
const ABORT =
  /Run aborted (?<reason>\(.+?)(?: Check inference server logs\.)?(?: Will exit non-zero\.)?$/u;

/**
 * Read the profiling-phase counters from the harness log. The same lines
 * appear in `aiperf.log` and, with another prefix, in `benchmark.log`.
 */
export function parseHarnessPhaseLog(text: string): HarnessPhaseCounters {
  const counters: HarnessPhaseCounters = {
    configuredWindowS: null,
    graceS: null,
    sent: null,
    inFlightAtWindowEnd: null,
    completed: null,
    cancelled: null,
    elapsedS: null,
    gracePeriodTimeout: null,
    phaseCompleted: false,
    abortReason: null,
  };
  for (const line of text.split('\n')) {
    if (!line.includes('rofiling') && !line.includes('Run aborted')) continue;
    const started = STARTED.exec(line)?.groups;
    if (started) counters.configuredWindowS = count(started.window);
    const sending = SENDING_COMPLETE.exec(line)?.groups;
    if (sending) {
      counters.sent = count(sending.sent);
      counters.inFlightAtWindowEnd = count(sending.inFlight);
    }
    const grace = GRACE_WAIT.exec(line)?.groups;
    if (grace) {
      const seconds = count(grace.grace);
      counters.graceS = seconds === null ? null : Math.round(seconds);
    }
    const complete = PHASE_COMPLETE.exec(line)?.groups;
    if (complete) {
      counters.completed = count(complete.completed);
      counters.cancelled = count(complete.cancelled);
      counters.elapsedS = count(complete.elapsed);
      counters.gracePeriodTimeout =
        complete.timeout === undefined ? null : complete.timeout === 'True';
      counters.phaseCompleted = true;
    }
    const abort = ABORT.exec(line.trimEnd())?.groups;
    if (abort && counters.abortReason === null) counters.abortReason = abort.reason.trim();
  }
  return counters;
}

// ---------------------------------------------------------------------------
// Aggregate JSON
// ---------------------------------------------------------------------------

export interface HarnessAggregate {
  contextOverflowCount: number | null;
  /** `benchmark_duration`: last valid response minus first request start, s. */
  benchmarkDurationS: number | null;
  /** The harness marked the run as cancelled. */
  wasCancelled: boolean | null;
}

function aggregateValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value !== null && typeof value === 'object') {
    const avg = (value as { avg?: unknown }).avg;
    if (typeof avg === 'number' && Number.isFinite(avg)) return avg;
  }
  return null;
}

/** Read the fields of `profile_export_aiperf.json` that attempt accounting uses. */
export function parseHarnessAggregate(json: unknown): HarnessAggregate {
  const aggregate = (json !== null && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >;
  return {
    contextOverflowCount: aggregateValue(aggregate.context_overflow_count),
    benchmarkDurationS: aggregateValue(aggregate.benchmark_duration),
    wasCancelled: typeof aggregate.was_cancelled === 'boolean' ? aggregate.was_cancelled : null,
  };
}

// ---------------------------------------------------------------------------
// Export records
// ---------------------------------------------------------------------------

interface ExportError {
  type?: unknown;
  code?: unknown;
  cause_chain?: unknown;
}

interface ExportRecord {
  metadata?: {
    benchmark_phase?: unknown;
    session_num?: unknown;
    request_start_ns?: unknown;
    request_end_ns?: unknown;
    was_cancelled?: unknown;
  };
  metrics?: Record<string, unknown>;
  error?: ExportError | null;
}

const UNIT_TO_MS: Record<string, number> = { ms: 1, sec: 1000, s: 1000, us: 1e-3, ns: 1e-6 };

/** A latency metric in ms, from the `{value, unit}` envelope or a bare number of ms. */
function metricMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || typeof value !== 'object') return null;
  const { value: amount, unit } = value as { value?: unknown; unit?: unknown };
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const factor = typeof unit === 'string' ? UNIT_TO_MS[unit] : 1;
  return factor === undefined ? null : amount * factor;
}

function metricCount(value: unknown): number | null {
  const amount =
    value !== null && typeof value === 'object' ? (value as { value?: unknown }).value : value;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
}

function micros(ms: number | null): number {
  return ms === null || ms < 0 ? SLA_NOT_RECORDED : Math.round(ms * 1000);
}

type AttemptRow = [ttftUs: number, tpotUs: number, e2eUs: number];

/**
 * Columns in a stable order, so the encoded blob and its content hash do not
 * depend on the order of the export lines.
 */
function completedColumns(rows: AttemptRow[]): SlaAttemptSet['completed'] {
  rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return {
    ttftUs: rows.map((row) => row[0]),
    tpotUs: rows.map((row) => row[1]),
    e2eUs: rows.map((row) => row[2]),
  };
}

/**
 * The class of an explicit failure. An HTTP rejection carries the status in
 * `code` and no `cause_chain`; an exception carries its class name.
 */
export function slaFailureClass(error: ExportError): string {
  const { code, type, cause_chain: causeChain } = error;
  if (typeof code === 'number' && code >= 400 && code <= 599 && causeChain === undefined) {
    return `http_${code}`;
  }
  return typeof type === 'string' && type.length > 0 ? type : 'unclassified';
}

export interface SlaExportContext {
  /** Text of the harness log, when the artifact has one. */
  harnessLog?: string | null;
  /** Parsed `profile_export_aiperf.json`, when the artifact has one. */
  aggregate?: unknown;
}

/**
 * Build the attempt data of one load point from the lines of its
 * `profile_export.jsonl`.
 *
 * Classification, profiling phase only (warmup records are counted and left out):
 * - no `error`: completed. A completed record without an end timestamp and
 *   without a latency is an incomplete attempt, not a completion.
 * - `error` with `CreditProcessingError`: the harness failed before dispatch;
 *   counted under `skippedBeforeDispatch`, never as an attempt.
 * - `error` with `was_cancelled` or `RequestCancellationError`: cancelled.
 * - any other `error`: failed, with the class from `slaFailureClass`. Latency
 *   values on a failed record are ignored: a stream that produced tokens and
 *   then broke is a failed attempt.
 * A completion is never inferred from a TTFT being present, and a missing
 * TTFT on a record without `error` is missing telemetry, not a failure.
 */
export async function slaAttemptsFromExport(
  lines: AsyncIterable<string> | Iterable<string>,
  context: SlaExportContext = {},
): Promise<SlaAttemptsBlob> {
  const rows: AttemptRow[] = [];
  const other = new Map<string, SlaOutcomeCount>();
  const bump = (outcome: SlaOutcomeCount['outcome'], failureClass: string | null): void => {
    const key = `${outcome}|${failureClass ?? ''}`;
    const entry = other.get(key);
    if (entry) entry.count += 1;
    else other.set(key, { outcome, failureClass, count: 1 });
  };

  let warmupExcluded = 0;
  let skippedBeforeDispatch = 0;
  let unparsedLines = 0;
  let firstStartNs = Number.POSITIVE_INFINITY;
  let lastEndNs = Number.NEGATIVE_INFINITY;
  const sequence = new Set<number>();
  let maxSequence = -1;

  for await (const line of lines) {
    if (line.trim().length === 0) continue;
    let record: ExportRecord;
    try {
      record = JSON.parse(line) as ExportRecord;
    } catch {
      unparsedLines += 1;
      continue;
    }
    const metadata = record.metadata ?? {};
    if (metadata.benchmark_phase === WARMUP_PHASE) {
      warmupExcluded += 1;
      continue;
    }
    if (metadata.benchmark_phase !== undefined && metadata.benchmark_phase !== PROFILING_PHASE) {
      continue;
    }
    if (typeof metadata.session_num === 'number') {
      sequence.add(metadata.session_num);
      if (metadata.session_num > maxSequence) maxSequence = metadata.session_num;
    }

    const error = record.error ?? null;
    if (error !== null && error.type === PRE_DISPATCH_ERROR) {
      skippedBeforeDispatch += 1;
      continue;
    }
    const startNs =
      typeof metadata.request_start_ns === 'number' ? metadata.request_start_ns : null;
    const endNs = typeof metadata.request_end_ns === 'number' ? metadata.request_end_ns : null;
    if (startNs !== null && startNs < firstStartNs) firstStartNs = startNs;
    if (endNs !== null && endNs > lastEndNs) lastEndNs = endNs;

    if (error !== null) {
      if (metadata.was_cancelled === true || error.type === CLIENT_CANCELLATION_ERROR) {
        bump('cancelled', null);
      } else {
        bump('failed', slaFailureClass(error));
      }
      continue;
    }

    const metrics = record.metrics ?? {};
    const latencyMs =
      metricMs(metrics.request_latency) ??
      (startNs !== null && endNs !== null ? (endNs - startNs) / 1e6 : null);
    if (latencyMs === null) {
      bump('incomplete', null);
      continue;
    }
    const tokens = metricCount(metrics.output_sequence_length);
    rows.push([
      micros(metricMs(metrics.time_to_first_token)),
      tokens !== null && tokens < 2
        ? SLA_TPOT_NOT_APPLICABLE
        : micros(metricMs(metrics.time_per_output_token) ?? metricMs(metrics.inter_token_latency)),
      micros(latencyMs),
    ]);
  }

  const log =
    typeof context.harnessLog === 'string' ? parseHarnessPhaseLog(context.harnessLog) : null;
  const aggregate =
    context.aggregate === undefined ? null : parseHarnessAggregate(context.aggregate);
  const logComplete = log !== null && log.phaseCompleted && log.sent !== null;
  const aborted = (log !== null && !logComplete) || aggregate?.wasCancelled === true;

  return {
    version: SLA_ATTEMPTS_VERSION,
    source: {
      kind: 'original_export',
      harnessLog: log === null ? 'absent' : aborted ? 'aborted' : 'complete',
      abortReason: log?.abortReason ?? null,
      sequenceGaps: maxSequence < 0 ? null : maxSequence + 1 - sequence.size,
      unparsedLines,
    },
    set: {
      completed: completedColumns(rows),
      // Code-point order, so the bytes do not depend on the locale of the machine.
      other: [...other.entries()]
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, entry]) => entry),
    },
    accounting: {
      issued: logComplete && !aborted ? log.sent : null,
      issuedLowerBound: maxSequence < 0 ? null : maxSequence + 1,
      skippedBeforeDispatch,
      incompleteAtCutoff: logComplete && !aborted ? log.cancelled : null,
      contextOverflowRejected: aggregate?.contextOverflowCount ?? null,
      warmupExcluded,
      // The harness issues one credit per request and has no retry path.
      retryAccounting: 'no_client_retries',
      outcomeSource: 'explicit',
      timings: {
        configuredWindowS: log?.configuredWindowS ?? null,
        graceS: log?.graceS ?? null,
        phaseElapsedS: log?.elapsedS ?? null,
        clientDurationS: aggregate?.benchmarkDurationS ?? null,
        attemptSpanS: lastEndNs > firstStartNs ? (lastEndNs - firstStartNs) / 1e9 : null,
        cutoffReached:
          log === null || !log.phaseCompleted
            ? null
            : (log.gracePeriodTimeout ?? (log.cancelled ?? 0) > 0),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Derived timeline
// ---------------------------------------------------------------------------

/** One request of the app's derived timeline. */
export interface TimelineAttempt {
  phase: string;
  startUs: number;
  endUs: number;
  ttftMs: number | null;
  tpotMs: number | null;
  outputTokens: number | null;
  cancelled: boolean;
}

/**
 * Attempt data from the app's derived request timeline, for points whose
 * original export has not been processed. The timeline keeps neither the
 * error of a record nor any harness counter, so outcomes are inferred: a
 * request with a TTFT is taken as completed and one without is `unknown`,
 * neither a failure nor a pass. Results from this path are exploratory.
 */
export function slaAttemptsFromTimeline(requests: Iterable<TimelineAttempt>): SlaAttemptsBlob {
  const rows: AttemptRow[] = [];
  let warmupExcluded = 0;
  let unknown = 0;
  let cancelled = 0;
  let firstStartUs = Number.POSITIVE_INFINITY;
  let lastEndUs = Number.NEGATIVE_INFINITY;
  for (const request of requests) {
    if (request.phase !== PROFILING_PHASE) {
      warmupExcluded += 1;
      continue;
    }
    if (request.startUs < firstStartUs) firstStartUs = request.startUs;
    if (request.endUs > lastEndUs) lastEndUs = request.endUs;
    if (request.cancelled) cancelled += 1;
    else if (request.ttftMs === null) unknown += 1;
    else {
      rows.push([
        micros(request.ttftMs),
        request.outputTokens !== null && request.outputTokens < 2
          ? SLA_TPOT_NOT_APPLICABLE
          : micros(request.tpotMs),
        Math.round(request.endUs - request.startUs),
      ]);
    }
  }
  const other: SlaOutcomeCount[] = [];
  if (cancelled > 0) other.push({ outcome: 'cancelled', failureClass: null, count: cancelled });
  if (unknown > 0) other.push({ outcome: 'unknown', failureClass: null, count: unknown });
  return {
    version: SLA_ATTEMPTS_VERSION,
    source: {
      kind: 'derived_timeline',
      harnessLog: 'absent',
      abortReason: null,
      sequenceGaps: null,
      unparsedLines: 0,
    },
    set: {
      completed: completedColumns(rows),
      other,
    },
    accounting: {
      issued: null,
      issuedLowerBound: null,
      skippedBeforeDispatch: null,
      incompleteAtCutoff: null,
      contextOverflowRejected: null,
      warmupExcluded,
      retryAccounting: 'unknown',
      outcomeSource: 'inferred',
      timings: {
        configuredWindowS: null,
        graceS: null,
        phaseElapsedS: null,
        clientDurationS: null,
        attemptSpanS: lastEndUs > firstStartUs ? (lastEndUs - firstStartUs) / 1e6 : null,
        cutoffReached: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixed-sequence request records
// ---------------------------------------------------------------------------

/** `request_records.schema_version` values this adapter reads. */
export const REQUEST_RECORDS_SCHEMA_VERSION = 1;
const REQUEST_CONCURRENCY_LIMIT = 'request_concurrency_limit';
const COMPLETED_OUTCOME = 'completed';
const HTTP_STATUS_OUTCOME = 'http_status';

/**
 * Why a `request_records` block yields no attempt data.
 * - `columns_omitted`: the producer left the per-attempt columns out of the
 *   aggregate because the point exceeds its size limit; counts alone cannot
 *   evaluate a latency target.
 * - `unsupported_schema_version`, `unsupported_load_kind`: written by a
 *   producer this adapter does not know; never read on a guess.
 * - `malformed_block`: a required field is missing or the block contradicts
 *   its own counts.
 */
export type RequestRecordsUnavailableReason =
  | 'columns_omitted'
  | 'unsupported_schema_version'
  | 'unsupported_load_kind'
  | 'malformed_block';

export type SlaRequestRecordsResult =
  | {
      kind: 'attempts';
      blob: SlaAttemptsBlob;
      /** The load setting is a limit on requests in flight, not a user count. */
      loadKind: 'request_concurrency';
      /** The limit itself; `null` when the client ran without one. */
      concurrencyLimit: number | null;
    }
  | { kind: 'unavailable'; reason: RequestRecordsUnavailableReason; detail: string };

function plainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function wholeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Split the `http_status` failures by status code when the per-code totals
 * account for every one of them; the columns carry no code per attempt.
 */
function httpFailureClasses(total: number, byCode: unknown): [string, number][] {
  const codes = Object.entries(plainObject(byCode) ?? {}).flatMap(([code, value]) => {
    const amount = wholeCount(value);
    return /^\d{3}$/u.test(code) && amount !== null && amount > 0
      ? [[`http_${code}`, amount] as [string, number]]
      : [];
  });
  const covered = codes.reduce((sum, [, amount]) => sum + amount, 0);
  return covered === total ? codes : [[HTTP_STATUS_OUTCOME, total]];
}

function unavailable(
  reason: RequestRecordsUnavailableReason,
  detail: string,
): SlaRequestRecordsResult {
  return { kind: 'unavailable', reason, detail };
}

/**
 * Build the attempt data of one fixed-sequence load point from the
 * `request_records` block of its result row.
 *
 * - The outcome column decides: only `completed` is a completion. A failed
 *   attempt keeps the TTFT it observed before failing, and stays a failure.
 * - A completed attempt without a TTFT is missing telemetry, not a failure.
 * - A completed attempt with fewer than two output tokens has no TPOT; it is
 *   stored as not applicable, the same rule as for AgentX.
 * - The window is count-bound: it ends when the last requested attempt
 *   returns, so nothing is cut off, and its length is the client's own
 *   duration. No dispatch window is configured, and none is invented.
 * - Warmup attempts are in no column; only their count is carried.
 */
export function slaAttemptsFromRequestRecords(block: unknown): SlaRequestRecordsResult {
  const root = plainObject(block);
  if (!root) return unavailable('malformed_block', 'request_records is not an object');
  if (root.schema_version !== REQUEST_RECORDS_SCHEMA_VERSION) {
    return unavailable(
      'unsupported_schema_version',
      `schema_version ${String(root.schema_version)}`,
    );
  }
  const load = plainObject(root.load) ?? {};
  if (load.max_concurrency_kind !== REQUEST_CONCURRENCY_LIMIT) {
    return unavailable(
      'unsupported_load_kind',
      `max_concurrency_kind ${String(load.max_concurrency_kind)}`,
    );
  }
  const counts = plainObject(root.counts) ?? {};
  const requested = wholeCount(counts.requested);
  const dispatched = wholeCount(counts.dispatched);
  if (requested === null || dispatched === null || dispatched > requested) {
    return unavailable('malformed_block', 'counts.requested or counts.dispatched is not usable');
  }
  const columns = plainObject(root.columns);
  if (!columns) {
    const omitted = plainObject(root.columns_omitted);
    return omitted
      ? unavailable(
          'columns_omitted',
          `${String(omitted.reason)}: ${String(omitted.attempts)} attempts, limit ${String(omitted.limit)}`,
        )
      : unavailable('malformed_block', 'neither columns nor columns_omitted');
  }
  const outcomes = Array.isArray(root.outcomes) ? root.outcomes : null;
  const { outcome, ttft_ms: ttft, tpot_ms: tpot, e2el_ms: e2el, output_len: outputLen } = columns;
  const startOffset = columns.start_offset_ms;
  if (
    !outcomes ||
    ![outcome, ttft, tpot, e2el, outputLen].every(
      (column) => Array.isArray(column) && column.length === dispatched,
    )
  ) {
    return unavailable(
      'malformed_block',
      'a column is missing or its length is not counts.dispatched',
    );
  }
  const starts =
    Array.isArray(startOffset) && startOffset.length === dispatched
      ? (startOffset as unknown[])
      : null;

  const rows: AttemptRow[] = [];
  const failures = new Map<string, number>();
  let firstStartMs = Number.POSITIVE_INFINITY;
  let lastEndMs = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < dispatched; index += 1) {
    const name = outcomes[(outcome as unknown[])[index] as number];
    const e2elMs = finite((e2el as unknown[])[index]);
    const startMs = starts === null ? null : finite(starts[index]);
    if (startMs !== null) {
      if (startMs < firstStartMs) firstStartMs = startMs;
      if (e2elMs !== null && startMs + e2elMs > lastEndMs) lastEndMs = startMs + e2elMs;
    }
    if (name !== COMPLETED_OUTCOME) {
      // An index outside `outcomes`, or a name this adapter has never seen, is a failure.
      const failureClass = typeof name === 'string' && name.length > 0 ? name : 'unclassified';
      failures.set(failureClass, (failures.get(failureClass) ?? 0) + 1);
      continue;
    }
    const tpotMs = finite((tpot as unknown[])[index]);
    const tokens = finite((outputLen as unknown[])[index]);
    rows.push([
      micros(finite((ttft as unknown[])[index])),
      tpotMs === null && tokens !== null && tokens < 2 ? SLA_TPOT_NOT_APPLICABLE : micros(tpotMs),
      micros(e2elMs),
    ]);
  }
  const statedCompleted = wholeCount(counts.completed);
  if (statedCompleted !== null && statedCompleted !== rows.length) {
    return unavailable(
      'malformed_block',
      `counts.completed ${statedCompleted} but ${rows.length} completed outcomes`,
    );
  }

  const httpFailures = failures.get(HTTP_STATUS_OUTCOME) ?? 0;
  failures.delete(HTTP_STATUS_OUTCOME);
  const other: SlaOutcomeCount[] = [
    ...failures.entries(),
    ...(httpFailures > 0 ? httpFailureClasses(httpFailures, counts.http_status) : []),
  ]
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([failureClass, amount]) => ({ outcome: 'failed', failureClass, count: amount }));

  const duration = finite(plainObject(root.window)?.duration);
  const retries = wholeCount(counts.retries);
  return {
    kind: 'attempts',
    loadKind: 'request_concurrency',
    concurrencyLimit: wholeCount(load.max_concurrency),
    blob: {
      version: SLA_ATTEMPTS_VERSION,
      source: {
        kind: 'request_records',
        harnessLog: 'not_applicable',
        abortReason: null,
        sequenceGaps: null,
        unparsedLines: 0,
      },
      set: { completed: completedColumns(rows), other },
      accounting: {
        issued: requested,
        issuedLowerBound: dispatched,
        skippedBeforeDispatch: requested - dispatched,
        // Count-bound window: every dispatched attempt returns before it closes.
        incompleteAtCutoff: 0,
        // The client has no such rejection; an over-long prompt is an HTTP failure.
        contextOverflowRejected: null,
        warmupExcluded: wholeCount(counts.warmup_excluded),
        retryAccounting: retries === 0 ? 'no_client_retries' : 'unknown',
        outcomeSource: 'explicit',
        timings: {
          configuredWindowS: null,
          graceS: null,
          phaseElapsedS: null,
          clientDurationS: duration !== null && duration > 0 ? duration : null,
          attemptSpanS: lastEndMs > firstStartMs ? (lastEndMs - firstStartMs) / 1000 : null,
          cutoffReached: false,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

interface SlaAttemptsWire extends Omit<SlaAttemptsBlob, 'set'> {
  set: {
    /** `ttftUs` is sorted, so it is stored as differences between neighbours. */
    completed: { ttftUsDelta: number[]; tpotUs: number[]; e2eUs: number[] };
    other: SlaOutcomeCount[];
  };
}

/** Gzip-compressed JSON. The same input always yields the same bytes. */
export function encodeSlaAttempts(blob: SlaAttemptsBlob): Buffer {
  const { ttftUs, tpotUs, e2eUs } = blob.set.completed;
  const wire: SlaAttemptsWire = {
    ...blob,
    set: {
      completed: {
        ttftUsDelta: ttftUs.map((value, index) =>
          index === 0 ? value : value - ttftUs[index - 1],
        ),
        tpotUs,
        e2eUs,
      },
      other: blob.set.other,
    },
  };
  return gzipSync(Buffer.from(JSON.stringify(wire), 'utf8'), { level: 9 });
}

export function decodeSlaAttempts(gz: Uint8Array): SlaAttemptsBlob {
  const wire = JSON.parse(gunzipSync(gz).toString('utf8')) as SlaAttemptsWire;
  const { ttftUsDelta, tpotUs, e2eUs } = wire.set.completed;
  let running = 0;
  const ttftUs = ttftUsDelta.map((delta) => (running += delta));
  return { ...wire, set: { completed: { ttftUs, tpotUs, e2eUs }, other: wire.set.other } };
}

/** Content identity of an encoded blob: the source-data part of an evaluation cache key. */
export function slaAttemptsSha256(gz: Uint8Array): string {
  return createHash('sha256').update(gz).digest('hex');
}
