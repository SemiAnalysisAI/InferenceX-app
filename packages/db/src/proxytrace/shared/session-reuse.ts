/** Aggregate-only session continuation evidence. No user or storage inference. */
import { asOfDate } from './as-of';
export const DEFAULT_REUSE_DAYS = [1, 2, 3, 4, 5, 6, 7, 14, 21, 28] as const;
export const REUSE_FOLLOWUP_DAYS = 28;
export const SESSION_REUSE_REFRESH_MS = 6 * 60 * 60 * 1000;
export const REUSE_COHORTS = ['all', 'multiDay', 'smallStart', 'searchAssisted'] as const;
export type ReuseCohort = (typeof REUSE_COHORTS)[number];
export const REUSE_COHORT_DEFINITIONS: Record<ReuseCohort, string> = {
  all: 'All eligible recorded sessions, including auxiliary/classifier calls.',
  multiDay: 'Activity on at least two UTC dates; not a verified persistent-agent label.',
  smallStart: 'At most five calls on the first observed UTC date; may subsequently expand.',
  searchAssisted: 'Contains a Web Search Agent label; not verified deep research.',
};

export interface ReuseWindow {
  asOf: string;
  observationStart: string;
  cohortStart: string;
  cohortEnd: string;
  activityStart: string;
  followupDays: number;
  activityDays: number;
}

export function sessionReuseWindow(now = asOfDate()): ReuseWindow {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const date = (days: number) => new Date(end - days * 86_400_000).toISOString();
  return {
    asOf: date(0),
    observationStart: date(120),
    cohortStart: date(90),
    cohortEnd: date(REUSE_FOLLOWUP_DAYS),
    activityStart: date(28),
    followupDays: REUSE_FOLLOWUP_DAYS,
    activityDays: 28,
  };
}

export interface ReusePoint {
  days: number;
  sessionsWithin: number;
  callsWithin: number;
  sessionsReturningAfterGap: number;
}

export interface ReuseSeries {
  key: ReuseCohort;
  definition: string;
  sessions: number;
  calls: number;
  points: ReusePoint[];
}

export interface SessionReusePayload {
  schema: 1;
  window: ReuseWindow;
  traceVersion: number | null;
  scope: 'all' | 'anon';
  coverage: {
    observedCalls: number;
    observedSessions: number;
    beforeCohortSessions: number;
    insufficientFollowupSessions: number;
  };
  cohorts: ReuseSeries[];
  activity: {
    calls: number;
    activeCredentials: number;
    activeCredentialDays: number;
    callsPerActiveCredentialDay: number | null;
    callsPerCredentialCalendarDay: number | null;
    medianActiveDayCalls: number | null;
    p90ActiveDayCalls: number | null;
  };
}

export type ReuseBucketKind =
  | 'sessionAge'
  | 'callAge'
  | 'returnGap'
  | 'coverage'
  | 'activityDailyCalls'
  | 'activityPeriodCalls';
export interface ReuseBucket {
  kind: ReuseBucketKind;
  cohort: string;
  bucket: number;
  count: number;
}

function total(rows: readonly ReuseBucket[]): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

/** R-7 quantile of a frequency table, without expanding request-sized arrays. */
function quantile(rows: readonly ReuseBucket[], p: number): number | null {
  const n = total(rows);
  if (!n) return null;
  const sorted = [...rows].toSorted((a, b) => a.bucket - b.bucket);
  const position = (n - 1) * p;
  const at = (index: number) => {
    let offset = 0;
    for (const r of sorted) {
      offset += r.count;
      if (index < offset) return r.bucket;
    }
    throw new Error('Invalid session reuse histogram');
  };
  return (
    at(Math.floor(position)) + (at(Math.ceil(position)) - at(Math.floor(position))) * (position % 1)
  );
}

export function buildSessionReusePayload(
  buckets: readonly ReuseBucket[],
  window: ReuseWindow,
  traceVersion: number | null,
  scope: 'all' | 'anon',
): SessionReusePayload {
  for (const r of buckets) {
    if (
      !Number.isSafeInteger(r.count) ||
      r.count < 0 ||
      !Number.isSafeInteger(r.bucket) ||
      r.bucket < 0
    ) {
      throw new Error('Invalid session reuse aggregate');
    }
  }
  const cohorts = REUSE_COHORTS.map((key): ReuseSeries => {
    const rows = buckets.filter((r) => r.cohort === key);
    const ages = rows.filter((r) => r.kind === 'sessionAge');
    const calls = rows.filter((r) => r.kind === 'callAge');
    const gaps = rows.filter((r) => r.kind === 'returnGap');
    if (total(ages) !== total(gaps)) throw new Error('Session reuse counts do not reconcile');
    return {
      key,
      definition: REUSE_COHORT_DEFINITIONS[key],
      sessions: total(ages),
      calls: total(calls),
      points: Array.from({ length: window.followupDays }, (_, i) => ({
        days: i + 1,
        sessionsWithin: total(ages.filter((r) => r.bucket <= i + 1)),
        callsWithin: total(calls.filter((r) => r.bucket <= i + 1)),
        sessionsReturningAfterGap: total(gaps.filter((r) => r.bucket > i + 1)),
      })),
    };
  });
  const dayRows = buckets.filter((r) => r.kind === 'activityDailyCalls');
  const periodRows = buckets.filter((r) => r.kind === 'activityPeriodCalls');
  const calls = dayRows.reduce((n, r) => n + r.bucket * r.count, 0);
  if (calls !== periodRows.reduce((n, r) => n + r.bucket * r.count, 0)) {
    throw new Error('Activity calls do not reconcile');
  }
  const activeCredentials = total(periodRows),
    activeCredentialDays = total(dayRows);
  const coverage = (name: string) =>
    total(buckets.filter((r) => r.kind === 'coverage' && r.cohort === name));
  return {
    schema: 1,
    window,
    traceVersion,
    scope,
    cohorts,
    coverage: {
      observedCalls: coverage('calls'),
      observedSessions: coverage('sessions'),
      beforeCohortSessions: coverage('beforeCohort'),
      insufficientFollowupSessions: coverage('tooRecent'),
    },
    activity: {
      calls,
      activeCredentials,
      activeCredentialDays,
      callsPerActiveCredentialDay: activeCredentialDays ? calls / activeCredentialDays : null,
      callsPerCredentialCalendarDay: activeCredentials
        ? calls / activeCredentials / window.activityDays
        : null,
      medianActiveDayCalls: quantile(dayRows, 0.5),
      p90ActiveDayCalls: quantile(dayRows, 0.9),
    },
  };
}

export function parseReuseDays(raw: string): number[] | null {
  const parts = raw.split(',').map((x) => x.trim());
  if (
    parts.length === 0 ||
    parts.length > REUSE_FOLLOWUP_DAYS ||
    parts.some((x) => !/^\d+$/u.test(x))
  )
    return null;
  const days = [...new Set(parts.map(Number))].toSorted((a, b) => a - b);
  return days.every((d) => d >= 1 && d <= REUSE_FOLLOWUP_DAYS) ? days : null;
}

export function selectReuseDays(
  data: SessionReusePayload,
  days: readonly number[],
): SessionReusePayload {
  return {
    ...data,
    cohorts: data.cohorts.map((c) => ({
      ...c,
      points: c.points.filter((p) => days.includes(p.days)),
    })),
  };
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Numeric aggregates and fixed labels only; no session/credential IDs. */
export function sessionReuseCsv(data: SessionReusePayload): string {
  const header = [
    'cohort',
    'days',
    'sessions',
    'calls',
    'sessions_within',
    'calls_within',
    'sessions_returning_after_gap',
    'as_of_utc',
    'observation_start_utc',
    'cohort_start_utc',
    'cohort_end_exclusive_utc',
    'minimum_followup_days',
    'trace_version',
    'visibility_scope',
    'activity_start_utc',
    'activity_days',
    'activity_calls',
    'active_credentials',
    'active_credential_days',
    'calls_per_active_credential_day',
    'calls_per_credential_calendar_day',
    'cohort_definition',
  ];
  const rows = data.cohorts.flatMap((c) =>
    c.points.map((p) => [
      c.key,
      p.days,
      c.sessions,
      c.calls,
      p.sessionsWithin,
      p.callsWithin,
      p.sessionsReturningAfterGap,
      data.window.asOf,
      data.window.observationStart,
      data.window.cohortStart,
      data.window.cohortEnd,
      data.window.followupDays,
      data.traceVersion ?? 'all',
      data.scope,
      data.window.activityStart,
      data.window.activityDays,
      data.activity.calls,
      data.activity.activeCredentials,
      data.activity.activeCredentialDays,
      data.activity.callsPerActiveCredentialDay ?? '',
      data.activity.callsPerCredentialCalendarDay ?? '',
      c.definition,
    ]),
  );
  return `${[header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}
