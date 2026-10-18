import { afterAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  buildSessionReusePayload,
  parseReuseDays,
  selectReuseDays,
  sessionReuseCsv,
  sessionReuseWindow,
  type ReuseBucket,
} from '@semianalysisai/inferencex-db/proxytrace/shared/session-reuse';
import { sessionReuseQuery } from '@semianalysisai/inferencex-db/proxytrace/session-reuse';
import type { Database } from '@semianalysisai/inferencex-db/proxytrace/types';

const window = sessionReuseWindow(new Date('2026-09-21T05:00:00Z'));
// Three sessions: one instant, one exactly seven days long, one fifteen days.
// Bucket boundaries are CEIL(age_days), so an exactly-seven-day call fits day 7.
const buckets: ReuseBucket[] = [
  { kind: 'sessionAge', cohort: 'all', bucket: 0, count: 1 },
  { kind: 'sessionAge', cohort: 'all', bucket: 7, count: 1 },
  { kind: 'sessionAge', cohort: 'all', bucket: 15, count: 1 },
  { kind: 'returnGap', cohort: 'all', bucket: 0, count: 1 },
  { kind: 'returnGap', cohort: 'all', bucket: 7, count: 1 },
  { kind: 'returnGap', cohort: 'all', bucket: 8, count: 1 },
  { kind: 'callAge', cohort: 'all', bucket: 0, count: 3 },
  { kind: 'callAge', cohort: 'all', bucket: 7, count: 4 },
  { kind: 'callAge', cohort: 'all', bucket: 15, count: 2 },
  { kind: 'activityDailyCalls', cohort: '', bucket: 2, count: 2 },
  { kind: 'activityDailyCalls', cohort: '', bucket: 5, count: 1 },
  { kind: 'activityPeriodCalls', cohort: '', bucket: 4, count: 1 },
  { kind: 'activityPeriodCalls', cohort: '', bucket: 5, count: 1 },
];

describe('session reuse accounting', () => {
  it('uses complete UTC dates, a lookback, and sufficient follow-up for every displayed cutoff', () => {
    expect(window).toEqual({
      asOf: '2026-09-21T00:00:00.000Z',
      observationStart: '2026-05-24T00:00:00.000Z',
      cohortStart: '2026-06-23T00:00:00.000Z',
      cohortEnd: '2026-08-24T00:00:00.000Z',
      activityStart: '2026-08-24T00:00:00.000Z',
      followupDays: 28,
      activityDays: 28,
    });
  });
  it('distinguishes call-weighted coverage from session coverage and strict return gaps', () => {
    const data = buildSessionReusePayload(buckets, window, null, 'anon');
    const all = data.cohorts[0];
    expect(all.sessions).toBe(3);
    expect(all.calls).toBe(9);
    expect(all.points[6]).toEqual({
      days: 7,
      sessionsWithin: 2,
      callsWithin: 7,
      sessionsReturningAfterGap: 1,
    });
    expect(all.points[13]).toEqual({
      days: 14,
      sessionsWithin: 2,
      callsWithin: 7,
      sessionsReturningAfterGap: 0,
    });
    expect(all.points[14].callsWithin).toBe(9);
    expect(data.activity).toEqual({
      calls: 9,
      activeCredentials: 2,
      activeCredentialDays: 3,
      callsPerActiveCredentialDay: 3,
      callsPerCredentialCalendarDay: 9 / 56,
      medianActiveDayCalls: 2,
      p90ActiveDayCalls: 4.4,
    });
  });
  it('does not turn empty cohorts or empty activity into measured zero utilization', () => {
    const data = buildSessionReusePayload([], window, 7, 'anon');
    expect(data.cohorts).toHaveLength(4);
    expect(data.cohorts[0].sessions).toBe(0);
    expect(data.activity.callsPerActiveCredentialDay).toBeNull();
    expect(data.activity.medianActiveDayCalls).toBeNull();
  });
  it('rejects broken accounting rather than publishing inconsistent counts', () => {
    expect(() =>
      buildSessionReusePayload(
        buckets.filter((r) => r.kind !== 'returnGap'),
        window,
        null,
        'all',
      ),
    ).toThrow('reconcile');
    expect(() =>
      buildSessionReusePayload(
        buckets.filter((r) => r.kind !== 'activityPeriodCalls'),
        window,
        null,
        'all',
      ),
    ).toThrow('reconcile');
    expect(() =>
      buildSessionReusePayload(
        [{ kind: 'callAge', cohort: 'all', bucket: -1, count: 2 }],
        window,
        null,
        'all',
      ),
    ).toThrow('Invalid');
  });
  it('validates custom cutoffs and exports the selected snapshot without mutation', () => {
    expect(parseReuseDays('7,1, 2,7,28')).toEqual([1, 2, 7, 28]);
    for (const bad of ['', '0', '29', '1.5', '1,', '1e1', '-2', 'NaN'])
      expect(parseReuseDays(bad)).toBeNull();
    const original = buildSessionReusePayload(buckets, window, 7, 'anon');
    const selected = selectReuseDays(original, [1, 7, 28]);
    expect(original.cohorts[0].points).toHaveLength(28);
    expect(selected.cohorts[0].points.map((p) => p.days)).toEqual([1, 7, 28]);
    const csv = sessionReuseCsv(selected);
    expect(csv.split('\r\n')).toHaveLength(14);
    expect(csv).toContain('all,7,3,9,2,7,1,2026-09-21');
    expect(csv).toContain('28,7,anon,2026-08-24');
    expect(csv).not.toContain('session_id');
  });
});

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: 'postgresql://localhost/session-reuse-test' }),
  }),
});
afterAll(() => db.destroy());
describe('session reuse SQL scope', () => {
  it('keeps chronology independent of version selection and filters private requests before aggregation', () => {
    const query = sessionReuseQuery([], 7, window).compile(db);
    expect(query.sql).toMatch(/r\.trace_version = \$\d+ AS selected/u);
    expect(query.sql).toContain("r.privacy_mode = 'anon'");
    expect(query.sql).toContain('count(*) FILTER(WHERE selected)');
    expect(query.sql).toContain('WHERE b.selected');
    expect(query.sql).toContain('e.active_days>1');
    expect(query.sql).not.toMatch(/request_body|response_body|request_headers/u);
    expect(query.sql).not.toMatch(/calls\s*>\s*20|30\s*\*\s*60/u);
    expect(query.parameters).toContain(window.cohortEnd);
    expect(query.parameters).toContain(window.asOf);
  });
  it('uses separate admin visibility without bypassing follow-up eligibility', () => {
    const query = sessionReuseQuery(null, null, window).compile(db);
    expect(query.sql).not.toContain("privacy_mode = 'anon'");
    expect(query.sql).toContain('TRUE AS selected');
    expect(query.sql).toContain('first_at <');
    expect(query.sql).toContain('selected_calls>0');
  });
});
