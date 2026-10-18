/**
 * Storage steps of `backfill-request-timeline.ts`, kept out of the CLI so they
 * can run against a real schema in tests: convert a current legacy
 * `request_timeline` JSONB into `request_timeline_gz` without the profile
 * blob, store gzip timelines through the bounded upload protocol trace ingest
 * uses, and clear legacy JSONB only when it equals the decoded gzip copy.
 */

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline.js';
import type { Sql } from '../etl/db-utils.js';
import { gzipRequestTimelineParts } from '../etl/request-timeline-codec.js';
import {
  TRACE_REPLAY_UPLOAD_CHUNK_BYTES,
  uploadTraceReplayPayloadChunks,
} from '../etl/trace-replay-ingest.js';
import { readRequestTimelineGz } from '../queries/request-timeline.js';

/**
 * Requests fetched per query while converting a legacy timeline. Each query
 * returns roughly 10 MiB of JSON for the current record shape.
 */
export const LEGACY_TIMELINE_SLICE_REQUESTS = 25_000;

/** A gzip timeline and the scalar columns stored beside it. */
export interface RequestTimelineGzRow {
  gz: Buffer;
  version: number;
  requestCount: number;
}

interface LegacyHeaderRow {
  header: Record<string, unknown> | null;
  request_count: number | null;
}

/**
 * The legacy document without its `requests` array, plus that array's
 * length. Null when the row has no JSONB timeline with a requests array.
 */
async function readLegacyHeader(
  sql: Sql,
  traceReplayId: number,
): Promise<{ header: Record<string, unknown>; requestCount: number } | null> {
  const [row] = await sql<LegacyHeaderRow[]>`
    select
      request_timeline - 'requests' as header,
      case
        when jsonb_typeof(request_timeline->'requests') = 'array'
          then jsonb_array_length(request_timeline->'requests')
      end as request_count
    from agentic_trace_replay
    where id = ${traceReplayId}
  `;
  if (!row?.header || row.request_count === null) return null;
  return { header: row.header, requestCount: Number(row.request_count) };
}

/**
 * Yield a legacy timeline's requests in index ranges of `sliceRequests`.
 * Postgres detoasts the document for each range but returns only that range,
 * so the client never holds the full document text. Every range must come
 * back complete.
 */
async function* legacyRequests(
  sql: Sql,
  traceReplayId: number,
  requestCount: number,
  sliceRequests: number,
): AsyncGenerator<object> {
  for (let from = 0; from < requestCount; from += sliceRequests) {
    const to = Math.min(from + sliceRequests, requestCount) - 1;
    const [row] = await sql<{ requests: unknown }[]>`
      select jsonb_path_query_array(
        request_timeline,
        'lax $.requests[$from to $to]',
        jsonb_build_object('from', ${from}::int, 'to', ${to}::int)
      ) as requests
      from agentic_trace_replay
      where id = ${traceReplayId}
    `;
    const requests = row?.requests;
    const expected = to - from + 1;
    if (!Array.isArray(requests) || requests.length !== expected) {
      const received = Array.isArray(requests) ? requests.length : 0;
      throw new Error(
        `legacy request_timeline returned ${received} of ${expected} requests at index ${from}`,
      );
    }
    for (const request of requests) {
      if (typeof request !== 'object' || request === null || Array.isArray(request)) {
        throw new Error(`legacy request_timeline holds a non-object request near index ${from}`);
      }
      yield request;
    }
  }
}

/**
 * Re-encode a current-version legacy `request_timeline` JSONB as gzip without
 * reading the profile blob. Throws, leaving the row unchanged, unless the
 * streamed request count equals `jsonb_array_length` both before and after
 * streaming.
 */
export async function convertLegacyRequestTimeline(
  sql: Sql,
  traceReplayId: number,
  sliceRequests = LEGACY_TIMELINE_SLICE_REQUESTS,
): Promise<RequestTimelineGzRow> {
  const legacy = await readLegacyHeader(sql, traceReplayId);
  if (!legacy) throw new Error('legacy request_timeline is missing or has no requests array');
  const { header, requestCount } = legacy;
  if (header.version !== REQUEST_TIMELINE_VERSION) {
    throw new Error(
      `legacy request_timeline version ${String(header.version)} is not ${REQUEST_TIMELINE_VERSION}`,
    );
  }

  const encoded = await gzipRequestTimelineParts(
    header,
    legacyRequests(sql, traceReplayId, requestCount, sliceRequests),
  );
  const after = await readLegacyHeader(sql, traceReplayId);
  if (encoded.requestCount !== requestCount || after?.requestCount !== requestCount) {
    throw new Error(
      `request count mismatch: jsonb_array_length was ${requestCount} before and ` +
        `${after?.requestCount ?? 'missing'} after streaming ${encoded.requestCount} ` +
        'requests; gzip not written',
    );
  }
  return { gz: encoded.gz, version: REQUEST_TIMELINE_VERSION, requestCount };
}

/**
 * Store a gzip timeline and its scalars in one transaction, uploading the
 * bytes in the bounded parts trace ingest uses. A newer stored version is
 * never replaced. Returns false when the row is gone or holds a newer version.
 */
export function writeRequestTimelineGz(
  sql: Sql,
  traceReplayId: number,
  stored: RequestTimelineGzRow,
): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`
      create temporary table trace_replay_upload_parts (
        field text not null,
        part integer not null,
        data bytea not null,
        primary key (field, part)
      ) on commit drop
    `;
    await uploadTraceReplayPayloadChunks(tx, 'request_timeline_gz', stored.gz);
    const updated = await tx<{ id: number }[]>`
      update agentic_trace_replay
      set
        request_timeline_gz = (
          select string_agg(data, ''::bytea order by part)
          from pg_temp.trace_replay_upload_parts
          where field = 'request_timeline_gz'
        ),
        request_timeline_version = ${stored.version},
        request_count = ${stored.requestCount}
      where id = ${traceReplayId}
        and coalesce(request_timeline_version, -1) <= ${stored.version}
      returning id
    `;
    return updated.length > 0;
  });
}

interface StoredTimelineRow {
  gz_bytes: number | null;
  version: number | null;
  request_count: number | null;
  legacy_version: number | null;
  legacy_count: number | null;
}

/**
 * Set a row's legacy `request_timeline` JSONB to null only when it equals its
 * gzip copy. The stored gzip is read in bounded slices and its decompressed
 * JSON uploaded in bounded parts, so PostgreSQL parses and compares the two
 * documents and neither crosses the network whole. Throws, keeping the JSONB,
 * when the gzip copy is missing, stale, corrupt, or differs in version,
 * request count, or content.
 */
export async function dropVerifiedLegacyRequestTimeline(
  sql: Sql,
  traceReplayId: number,
): Promise<void> {
  const [row] = await sql<StoredTimelineRow[]>`
    select
      octet_length(request_timeline_gz) as gz_bytes,
      request_timeline_version as version,
      request_count,
      (request_timeline->>'version')::int as legacy_version,
      case
        when jsonb_typeof(request_timeline->'requests') = 'array'
          then jsonb_array_length(request_timeline->'requests')
      end as legacy_count
    from agentic_trace_replay
    where id = ${traceReplayId}
  `;
  if (
    !row ||
    row.gz_bytes === null ||
    row.version !== REQUEST_TIMELINE_VERSION ||
    row.request_count === null
  ) {
    throw new Error('gzip request timeline is missing or stale; legacy JSONB kept');
  }
  if (row.legacy_version !== row.version) {
    throw new Error(
      `legacy JSONB is version ${row.legacy_version ?? 'unknown'} and gzip is version ` +
        `${row.version}, so their content cannot match; legacy JSONB kept`,
    );
  }
  if (row.legacy_count !== row.request_count) {
    throw new Error(
      `gzip holds ${row.request_count} requests but legacy JSONB holds ` +
        `${row.legacy_count ?? 'none'}; legacy JSONB kept`,
    );
  }

  const gz = await readRequestTimelineGz(sql, traceReplayId, row.gz_bytes);
  const gzMd5 = createHash('md5').update(gz).digest('hex');
  const cleared = await sql.begin(async (tx) => {
    await tx`
      create temporary table trace_replay_upload_parts (
        field text not null,
        part integer not null,
        data bytea not null,
        primary key (field, part)
      ) on commit drop
    `;
    // Corrupt gzip throws here and rolls the transaction back.
    let part = 0;
    const json = Readable.from([gz]).pipe(
      createGunzip({ chunkSize: TRACE_REPLAY_UPLOAD_CHUNK_BYTES }),
    );
    for await (const chunk of json) {
      const data: Buffer = chunk;
      await tx`
        insert into pg_temp.trace_replay_upload_parts (field, part, data)
        values ('request_timeline_json', ${part}, ${data})
      `;
      part += 1;
    }
    // jsonb equality ignores formatting and key order, so only content counts.
    // The md5 pins the gzip bytes that were decoded above.
    const updated = await tx<{ id: number }[]>`
      update agentic_trace_replay
      set request_timeline = null
      where id = ${traceReplayId}
        and request_timeline_version = ${REQUEST_TIMELINE_VERSION}
        and request_count = ${row.request_count}
        and md5(request_timeline_gz) = ${gzMd5}
        and request_timeline = (
          select convert_from(string_agg(data, ''::bytea order by part), 'UTF8')::jsonb
          from pg_temp.trace_replay_upload_parts
          where field = 'request_timeline_json'
        )
      returning id
    `;
    return updated.length;
  });
  if (cleared === 0) {
    throw new Error('legacy JSONB differs from the decoded gzip timeline; legacy JSONB kept');
  }
}
