export interface Skips {
  badZip: number;
  unmappedModel: number;
  unmappedHw: number;
  noIslOsl: number;
  failedRun: number;
  dbError: number;
  telemetryError: number;
  traceReplayMissing: number;
}

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

export interface DbWriteFailure {
  kind: DbWriteKind;
  subject: string;
  message: string;
  code?: string;
}

const MAX_FAILURE_MESSAGE_CHARS = 2000;

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

export const DB_WRITE_WARNING_RULES: readonly {
  kind: DbWriteKind;
  code: string;
  reason: string;
}[] = [];

export function dbWriteWarningRule(failure: Pick<DbWriteFailure, 'kind' | 'code'>) {
  return DB_WRITE_WARNING_RULES.find(
    (rule) => rule.kind === failure.kind && rule.code === failure.code,
  );
}

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
  dbWriteErrors: DbWriteFailure[];
  dbWriteWarnings: DbWriteFailure[];
  recordDbError: (kind: DbWriteKind, subject: string, err: unknown) => void;
  recordTelemetryError: (context: string, err: Error) => void;
  snapshot: () => SkipSnapshot;
  diff: (before: SkipSnapshot) => {
    droppedModel: number;
    droppedHw: number;
    droppedIslOsl: number;
    newModels: string[];
    newHws: string[];
  };
}

const MAX_DB_ERRORS = 10;

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
