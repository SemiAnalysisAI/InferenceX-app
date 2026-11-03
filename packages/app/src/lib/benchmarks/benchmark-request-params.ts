import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import {
  parsePowerValidityFilter,
  type PowerValidityFilter,
} from '@/lib/benchmarks/benchmark-power-validity';
import { PUBLIC_API_ERRORS } from '@/lib/api/public-api-errors';

export const CALCULATOR_SEQUENCES = ['1k/1k', '1k/8k', '8k/1k', 'agentic-traces'] as const;

/** Every 400 message `/api/v1/benchmarks` can return, in the order the route checks them. */
export const BENCHMARK_REQUEST_ERRORS = {
  unknownModel: PUBLIC_API_ERRORS.unknownModel,
  invalidDate: PUBLIC_API_ERRORS.invalidDate,
  invalidExact: 'exact must be true or false',
  invalidRunId: 'runId must be a positive integer GitHub Actions run ID',
  invalidExactRun: 'exactRun must be true or false',
  exactRunWithoutRunId: 'exactRun=true requires runId',
  unknownView: 'Unknown view',
  unknownSequence: 'Unknown calculator sequence',
  unknownPowerValid: 'Unknown powerValid filter',
  powerValidWithCalculator: 'powerValid cannot be combined with view=calculator',
} as const;

export interface BenchmarkRequestParams {
  dbModelKeys: string[];
  /** YYYY-MM-DD, or undefined for the latest snapshot. */
  date: string | undefined;
  exact: boolean;
  runId: string | undefined;
  exactRun: boolean;
  view: 'calculator' | undefined;
  /** Set only for view=calculator. */
  sequence: string;
  powerValid: PowerValidityFilter | null;
}

export type BenchmarkRequestParseResult =
  | { ok: true; params: BenchmarkRequestParams }
  | { ok: false; error: string };

const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

const fail = (error: string): BenchmarkRequestParseResult => ({ ok: false, error });

/** A real calendar date Postgres accepts as `::date` (year 0001-9999). */
export function isCalendarDate(value: string): boolean {
  const groups = ISO_DATE.exec(value)?.groups;
  if (!groups) return false;
  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(2000, month, 0)).getUTCDate();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= (month === 2 && !leap ? 28 : lastDay);
}

/** Numeric GitHub run ID small enough to survive the query's `Number()` conversion. */
function isRunId(value: string): boolean {
  return /^[1-9]\d{0,15}$/u.test(value) && Number.isSafeInteger(Number(value));
}

/** `'true'`/`'false'` → boolean, absent → false, anything else → undefined. */
function parseFlag(value: string | null): boolean | undefined {
  if (value === null || value === 'false') return false;
  if (value === 'true') return true;
  return undefined;
}

/**
 * Validate `/api/v1/benchmarks` query parameters before any database call, so
 * a malformed value is a 400 instead of a Postgres cast error and a 500.
 * Unknown parameters are ignored. An empty `date=` means the latest snapshot.
 */
export function parseBenchmarkRequest(search: URLSearchParams): BenchmarkRequestParseResult {
  const dbModelKeys = DISPLAY_MODEL_TO_DB[search.get('model') ?? ''];
  if (!dbModelKeys || dbModelKeys.length === 0) return fail(BENCHMARK_REQUEST_ERRORS.unknownModel);

  const date = search.get('date') || undefined;
  if (date !== undefined && !isCalendarDate(date))
    return fail(BENCHMARK_REQUEST_ERRORS.invalidDate);

  const exact = parseFlag(search.get('exact'));
  if (exact === undefined) return fail(BENCHMARK_REQUEST_ERRORS.invalidExact);

  const runIdParam = search.get('runId');
  if (runIdParam !== null && !isRunId(runIdParam))
    return fail(BENCHMARK_REQUEST_ERRORS.invalidRunId);
  const runId = runIdParam ?? undefined;

  const exactRun = parseFlag(search.get('exactRun'));
  if (exactRun === undefined) return fail(BENCHMARK_REQUEST_ERRORS.invalidExactRun);
  if (exactRun && runId === undefined) return fail(BENCHMARK_REQUEST_ERRORS.exactRunWithoutRunId);

  const viewParam = search.get('view');
  if (viewParam !== null && viewParam !== 'calculator') {
    return fail(BENCHMARK_REQUEST_ERRORS.unknownView);
  }
  const view = viewParam ?? undefined;

  const sequence = search.get('sequence') ?? '';
  if (view === 'calculator' && !(CALCULATOR_SEQUENCES as readonly string[]).includes(sequence)) {
    return fail(BENCHMARK_REQUEST_ERRORS.unknownSequence);
  }

  const powerValid = parsePowerValidityFilter(search.get('powerValid'));
  if (powerValid === undefined) return fail(BENCHMARK_REQUEST_ERRORS.unknownPowerValid);
  // The calculator cache stores rows already trimmed to an allowlist that
  // excludes power_valid, so post-cache filtering cannot work there.
  if (view === 'calculator' && powerValid !== null) {
    return fail(BENCHMARK_REQUEST_ERRORS.powerValidWithCalculator);
  }

  return {
    ok: true,
    params: {
      dbModelKeys,
      date,
      exact,
      runId,
      exactRun,
      view,
      sequence: view === 'calculator' ? sequence : '',
      powerValid,
    },
  };
}
