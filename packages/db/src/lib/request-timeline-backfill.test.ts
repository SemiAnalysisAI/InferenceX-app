import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import type { Sql } from '../etl/db-utils';
import { gunzipRequestTimeline, gzipRequestTimeline } from '../etl/request-timeline-codec';
import {
  convertLegacyRequestTimeline,
  dropVerifiedLegacyRequestTimeline,
  writeRequestTimelineGz,
} from './request-timeline-backfill';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

function timelineWith(requestCount: number): RequestTimeline {
  return {
    version: REQUEST_TIMELINE_VERSION,
    startNs: 1_700_000_000_000_000_000,
    endNs: 1_700_000_001_400_000_000,
    durationS: 1.4,
    requests: Array.from({ length: requestCount }, (_, index) => ({
      cid: `trace-${String(index).padStart(3, '0')}`,
      ri: index,
      ti: 0,
      srcTrace: `weka-${index}`,
      wid: String(index % 4),
      ad: 0,
      phase: index === 0 ? 'warmup' : 'profiling',
      credit: index * 1_000_000,
      start: index * 1_000_000 + 200_000,
      ack: index === 2 ? null : index * 1_000_000 + 800_000,
      end: index * 1_000_000 + 30_000_000,
      ttftMs: index === 2 ? null : 42.3 + index / 3,
      tpotMs: 18.1,
      isl: 18_320 + index,
      osl: index === 3 ? null : 410 + index,
      cancelled: index === 4,
    })),
  };
}

interface StoredRow {
  request_timeline: unknown;
  request_timeline_gz: Uint8Array | null;
  request_timeline_version: number | null;
  request_count: number | null;
}

let db: PGlite;
let sql: PgliteSql;

async function storedRow(id: number): Promise<StoredRow> {
  const [row] = (await sql`
    select request_timeline, request_timeline_gz, request_timeline_version, request_count
    from agentic_trace_replay
    where id = ${id}
  `) as unknown as StoredRow[];
  return row!;
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE agentic_trace_replay RESTART IDENTITY CASCADE');
});

describe('convertLegacyRequestTimeline (PostgreSQL)', () => {
  it('re-encodes a current legacy JSONB timeline in index ranges without a profile blob', async () => {
    const legacy = timelineWith(5);
    await sql`
      insert into agentic_trace_replay (id, request_timeline)
      values (3811, ${JSON.stringify(legacy)}::jsonb)
    `;

    const stored = await convertLegacyRequestTimeline(sql, 3811, 2);
    expect(stored.version).toBe(REQUEST_TIMELINE_VERSION);
    expect(stored.requestCount).toBe(5);
    expect(gunzipRequestTimeline(stored.gz)).toEqual(legacy);

    await expect(writeRequestTimelineGz(sql, 3811, stored)).resolves.toBe(true);
    const row = await storedRow(3811);
    expect(row.request_timeline_version).toBe(REQUEST_TIMELINE_VERSION);
    expect(row.request_count).toBe(5);
    expect(gunzipRequestTimeline(row.request_timeline_gz!)).toEqual(legacy);
    expect(row.request_timeline).toEqual(legacy);
  });

  it('refuses a legacy timeline computed by another version', async () => {
    const stale = { ...timelineWith(2), version: REQUEST_TIMELINE_VERSION - 1 };
    await sql`
      insert into agentic_trace_replay (id, request_timeline)
      values (12, ${JSON.stringify(stale)}::jsonb)
    `;

    await expect(convertLegacyRequestTimeline(sql, 12)).rejects.toThrow(
      `version ${REQUEST_TIMELINE_VERSION - 1} is not ${REQUEST_TIMELINE_VERSION}`,
    );
  });

  it('refuses a row without a legacy requests array', async () => {
    await sql`insert into agentic_trace_replay (id) values (13)`;

    await expect(convertLegacyRequestTimeline(sql, 13)).rejects.toThrow(
      'missing or has no requests array',
    );
  });
});

function scriptedSql(headerCounts: number[], ranges: unknown[][]): Sql {
  const counts = [...headerCounts];
  const slices = [...ranges];
  const header = { version: REQUEST_TIMELINE_VERSION, startNs: 0, endNs: 1, durationS: 0 };
  return ((strings: TemplateStringsArray) => {
    const text = strings.join('?');
    if (text.includes("request_timeline - 'requests'")) {
      return Promise.resolve([{ header, request_count: counts.shift() }]);
    }
    if (text.includes('jsonb_path_query_array')) {
      return Promise.resolve([{ requests: slices.shift() }]);
    }
    return Promise.reject(new Error(`unexpected query: ${text}`));
  }) as unknown as Sql;
}

const scriptedRequest = (cid: string) => ({ cid, ti: 0, phase: 'profiling' });

describe('convertLegacyRequestTimeline (request count checks)', () => {
  it('rejects a range that returns fewer requests than jsonb_array_length reported', async () => {
    const scripted = scriptedSql([3, 3], [[scriptedRequest('a'), scriptedRequest('b')]]);

    await expect(convertLegacyRequestTimeline(scripted, 3811, 25_000)).rejects.toThrow(
      'returned 2 of 3 requests at index 0',
    );
  });

  it('rejects an array that grew while it was streamed', async () => {
    const scripted = scriptedSql([2, 3], [[scriptedRequest('a'), scriptedRequest('b')]]);

    await expect(convertLegacyRequestTimeline(scripted, 3811, 25_000)).rejects.toThrow(
      'request count mismatch: jsonb_array_length was 2 before and 3 after',
    );
  });
});

describe('writeRequestTimelineGz', () => {
  it('never replaces a newer stored timeline version', async () => {
    await sql`
      insert into agentic_trace_replay (id, request_timeline_gz, request_timeline_version, request_count)
      values (21, ${Buffer.from('newer')}, ${REQUEST_TIMELINE_VERSION + 1}, 9)
    `;
    const gz = await gzipRequestTimeline(timelineWith(1));

    await expect(
      writeRequestTimelineGz(sql, 21, { gz, version: REQUEST_TIMELINE_VERSION, requestCount: 1 }),
    ).resolves.toBe(false);
    const row = await storedRow(21);
    expect(Buffer.from(row.request_timeline_gz!).toString()).toBe('newer');
    expect(row.request_count).toBe(9);
  });
});

describe('dropVerifiedLegacyRequestTimeline', () => {
  async function convertedRow(id: number, legacy: RequestTimeline): Promise<void> {
    await sql`
      insert into agentic_trace_replay (id, request_timeline)
      values (${id}, ${JSON.stringify(legacy)}::jsonb)
    `;
    await writeRequestTimelineGz(sql, id, await convertLegacyRequestTimeline(sql, id));
  }

  it('clears the legacy JSONB once the stored gzip copy decodes and matches', async () => {
    const legacy = timelineWith(5);
    await convertedRow(31, legacy);

    await dropVerifiedLegacyRequestTimeline(sql, 31);

    const row = await storedRow(31);
    expect(row.request_timeline).toBeNull();
    expect(gunzipRequestTimeline(row.request_timeline_gz!)).toEqual(legacy);
  });

  it('keeps the legacy JSONB when no gzip copy exists', async () => {
    const legacy = timelineWith(3);
    await sql`
      insert into agentic_trace_replay (id, request_timeline)
      values (32, ${JSON.stringify(legacy)}::jsonb)
    `;

    await expect(dropVerifiedLegacyRequestTimeline(sql, 32)).rejects.toThrow(
      'gzip request timeline is missing or stale',
    );
    const row = await storedRow(32);
    expect(row.request_timeline).toEqual(legacy);
  });

  it('keeps the legacy JSONB when the stored request count disagrees with it', async () => {
    const legacy = timelineWith(5);
    await convertedRow(33, legacy);
    await sql`update agentic_trace_replay set request_count = 4 where id = 33`;

    await expect(dropVerifiedLegacyRequestTimeline(sql, 33)).rejects.toThrow(
      'gzip holds 4 requests but legacy JSONB holds 5',
    );
    const row = await storedRow(33);
    expect(row.request_timeline).toEqual(legacy);
  });

  it('keeps the legacy JSONB when same-version, same-count content differs', async () => {
    const legacy = timelineWith(5);
    await sql`
      insert into agentic_trace_replay (id, request_timeline)
      values (34, ${JSON.stringify(legacy)}::jsonb)
    `;
    const edited = timelineWith(5);
    edited.requests[3]!.isl = 1;
    await writeRequestTimelineGz(sql, 34, {
      gz: await gzipRequestTimeline(edited),
      version: REQUEST_TIMELINE_VERSION,
      requestCount: 5,
    });

    await expect(dropVerifiedLegacyRequestTimeline(sql, 34)).rejects.toThrow(
      'legacy JSONB differs from the decoded gzip timeline',
    );
    const row = await storedRow(34);
    expect(row.request_timeline).toEqual(legacy);
  });

  it('keeps a legacy JSONB of another version, whose content cannot match', async () => {
    const stale = { ...timelineWith(5), version: REQUEST_TIMELINE_VERSION - 1 };
    await sql`
      insert into agentic_trace_replay (id, request_timeline)
      values (35, ${JSON.stringify(stale)}::jsonb)
    `;
    await writeRequestTimelineGz(sql, 35, {
      gz: await gzipRequestTimeline(timelineWith(5)),
      version: REQUEST_TIMELINE_VERSION,
      requestCount: 5,
    });

    await expect(dropVerifiedLegacyRequestTimeline(sql, 35)).rejects.toThrow(
      `legacy JSONB is version ${REQUEST_TIMELINE_VERSION - 1}`,
    );
    const row = await storedRow(35);
    expect(row.request_timeline).toEqual(stale);
  });

  it('keeps the legacy JSONB when the stored gzip is corrupt', async () => {
    const legacy = timelineWith(5);
    await convertedRow(36, legacy);
    await sql`
      update agentic_trace_replay
      set request_timeline_gz = set_byte(
        request_timeline_gz,
        octet_length(request_timeline_gz) / 2,
        get_byte(request_timeline_gz, octet_length(request_timeline_gz) / 2) # 255
      )
      where id = 36
    `;

    await expect(dropVerifiedLegacyRequestTimeline(sql, 36)).rejects.toThrow();
    const row = await storedRow(36);
    expect(row.request_timeline).toEqual(legacy);
  });
});
