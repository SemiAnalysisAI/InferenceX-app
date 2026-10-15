/**
 * Skip/error tracking for ingest runs.
 * `createSkipTracker()` returns a stateful tracker that all ETL functions share.
 */

export interface Skips {
  badZip: number;
  unmappedModel: number;
  unmappedHw: number;
  noIslOsl: number;
  failedRun: number;
  dbError: number;
  /**
   * PowerX telemetry failures: a `gpu_metrics_*` or `power_audit_*` artifact
   * whose series could not be stored, or an AgentX window plan that could not
   * be read or attached.
   * Counted apart from `dbError` because they are not fatal: the benchmark
   * rows land either way, only the point's telemetry or provenance is
   * affected, and `admin:db:backfill-gpu-metrics` can repeat the step later.
   * Folding these into `dbError` would let one malformed CSV turn the whole
   * production ingest red, through the publication manifest that
   * verify-power-publication treats as fatal.
   */
  telemetryError: number;
  /** Agentic point whose sibling `agentic_<suffix>` artifact had no trace_replay files. */
  traceReplayMissing: number;
}

/** Database write steps of an ingest run, as reported in the database write receipt. */
export const DB_WRITE_KINDS = [
  'config',
  'benchmark',
  'server_logs',
  'trace_replay',
  'availability',
  'run_stats',
  'eval',
  'changelog',
] as const;
export type DbWriteKind = (typeof DB_WRITE_KINDS)[number];

/** One failed database write. `code` is the SQLSTATE or postgres.js client code, when known. */
export interface DbWriteFailure {
  kind: DbWriteKind;
  /** The point, artifact or batch whose write failed. */
  subject: string;
  message: string;
  code?: string;
}

// Bound one failure's message so a giant error cannot bloat the receipt.
const MAX_FAILURE_MESSAGE_CHARS = 2000;

/** SQLSTATE or postgres.js client code of a caught error, or of its cause. */
export function dbErrorCode(err: unknown): string | undefined {
  for (let current = err, depth = 0; current && depth < 3; depth++) {
    if (typeof current !== 'object') return undefined;
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && code.length > 0) return code;
    current = cause;
  }
  return undefined;
}

function failureMessage(err: unknown): string {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'unknown');
  return message.length > MAX_FAILURE_MESSAGE_CHARS
    ? `${message.slice(0, MAX_FAILURE_MESSAGE_CHARS)}... (truncated)`
    : message;
}

/**
 * Known database write failures that are reported as warnings: not counted in
 * `skips.dbError` and not fatal. Every other failure is an error. Remove an
 * entry once the storage it describes changes.
 */
export const DB_WRITE_WARNING_RULES: readonly {
  kind: DbWriteKind;
  code: string;
  reason: string;
}[] = [
  {
    // program_limit_exceeded: request_timeline is stored as one jsonb array and
    // very large traces pass the 256 MiB jsonb limit until trace storage changes.
    kind: 'trace_replay',
    code: '54000',
    reason: 'trace replay exceeds the Postgres jsonb size limit',
  },
];

/** The warning rule matching a failure, or undefined when the failure is an error. */
export function dbWriteWarningRule(failure: Pick<DbWriteFailure, 'kind' | 'code'>) {
  return DB_WRITE_WARNING_RULES.find(
    (rule) => rule.kind === failure.kind && rule.code === failure.code,
  );
}

/** Build a failure record from a caught error. */
export function dbWriteFailure(kind: DbWriteKind, subject: string, err: unknown): DbWriteFailure {
  const code = dbErrorCode(err);
  return { kind, subject, message: failureMessage(err), ...(code ? { code } : {}) };
}

export interface SkipSnapshot {
  model: number;
  hw: number;
  islOsl: number;
  models: Set<string>;
  hws: Set<string>;
}

export interface SkipTracker {
  skips: Skips;
  unmappedModels: Set<string>;
  unmappedHws: Set<string>;
  unmappedPrecisions: Set<string>;
  /** Failed database writes, in the order they were recorded. Each one counts in `skips.dbError`. */
  dbWriteErrors: DbWriteFailure[];
  /** Failed database writes that are known and not fatal; not counted in `skips.dbError`. */
  dbWriteWarnings: DbWriteFailure[];
  /**
   * Record a failed database write, printing the first `MAX_DB_ERRORS` to
   * stderr and suppressing further output while still recording it.
   *
   * @param kind - The write step that failed.
   * @param subject - The point, artifact or batch being written.
   * @param err - The caught error.
   */
  recordDbError: (kind: DbWriteKind, subject: string, err: unknown) => void;
  /** Record a non-fatal telemetry failure into `skips.telemetryError`, with the same print cap. */
  recordTelemetryError: (context: string, err: Error) => void;
  /**
   * Capture a point-in-time snapshot of the current skip counters and
   * unmapped-name sets. Used together with `diff()` to report per-artifact drops.
   *
   * @returns A `SkipSnapshot` with copies of the current counts and name sets.
   */
  snapshot: () => SkipSnapshot;
  /**
   * Compute the incremental change in skip counters since a previous snapshot.
   * Use this to emit per-artifact warnings without scanning the full totals.
   *
   * @param before - Snapshot taken before processing the artifact.
   * @returns Counts of newly dropped rows and arrays of newly seen unmapped names.
   */
  diff: (before: SkipSnapshot) => {
    droppedModel: number;
    droppedHw: number;
    droppedIslOsl: number;
    newModels: string[];
    newHws: string[];
  };
}

// Cap noisy DB errors: print first MAX_DB_ERRORS, then just count the rest.
const MAX_DB_ERRORS = 10;

/**
 * Create a shared skip/error tracker for a single ingest run.
 * All ETL functions accept a `SkipTracker` and mutate it in place, so the
 * top-level script has one consistent view of everything that was skipped.
 *
 * @returns A `SkipTracker` with zeroed counters and empty unmapped-name sets.
 */
export function createSkipTracker(): SkipTracker {
  const skips: Skips = {
    badZip: 0,
    unmappedModel: 0,
    unmappedHw: 0,
    noIslOsl: 0,
    failedRun: 0,
    dbError: 0,
    telemetryError: 0,
    traceReplayMissing: 0,
  };
  const unmappedModels = new Set<string>();
  const unmappedHws = new Set<string>();
  const unmappedPrecisions = new Set<string>();
  const dbWriteErrors: DbWriteFailure[] = [];
  const dbWriteWarnings: DbWriteFailure[] = [];
  const cappedPrinter = (tag: string, suppressedNote: string) => {
    let printed = 0;
    return (line: string): void => {
      if (printed >= MAX_DB_ERRORS) return;
      console.error(`  [${tag}] ${line}`);
      printed++;
      if (printed === MAX_DB_ERRORS) {
        console.error(`  [${tag}] ${suppressedNote}`);
      }
    };
  };
  const printDbError = cappedPrinter(
    'DB ERROR',
    'further DB errors suppressed; all are listed in the database write receipt',
  );
  const printTelemetryError = cappedPrinter(
    'TELEMETRY',
    'further telemetry errors suppressed; count included in summary',
  );
  const printDbWarning = cappedPrinter(
    'DB WARNING',
    'further DB warnings suppressed; all are listed in the database write receipt',
  );

  return {
    skips,
    unmappedModels,
    unmappedHws,
    unmappedPrecisions,

    dbWriteErrors,
    dbWriteWarnings,

    recordDbError(kind: DbWriteKind, subject: string, err: unknown): void {
      const failure = dbWriteFailure(kind, subject, err);
      const detail = `${kind} for ${subject}: ${failure.message}${failure.code ? ` (code ${failure.code})` : ''}`;
      const warning = dbWriteWarningRule(failure);
      if (warning) {
        dbWriteWarnings.push(failure);
        printDbWarning(`${detail}; ${warning.reason}`);
        return;
      }
      skips.dbError++;
      dbWriteErrors.push(failure);
      printDbError(detail);
    },
    recordTelemetryError(context: string, err: Error): void {
      skips.telemetryError++;
      printTelemetryError(`${context}: ${err.message}`);
    },

    snapshot(): SkipSnapshot {
      return {
        model: skips.unmappedModel,
        hw: skips.unmappedHw,
        islOsl: skips.noIslOsl,
        models: new Set(unmappedModels),
        hws: new Set(unmappedHws),
      };
    },

    diff(before: SkipSnapshot) {
      return {
        droppedModel: skips.unmappedModel - before.model,
        droppedHw: skips.unmappedHw - before.hw,
        droppedIslOsl: skips.noIslOsl - before.islOsl,
        newModels: [...unmappedModels].filter((m) => !before.models.has(m)),
        newHws: [...unmappedHws].filter((h) => !before.hws.has(h)),
      };
    },
  };
}
