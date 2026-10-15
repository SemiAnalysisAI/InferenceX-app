/**
 * Storage steps of `backfill-request-timeline.ts`, kept out of the CLI so they
 * can run against a real schema in tests: convert a current legacy
 * `request_timeline` JSONB into `request_timeline_gz` without the profile
 * blob, store gzip timelines through the bounded upload protocol trace ingest
 * uses, and clear legacy JSONB only after its gzip copy has been verified.
 */

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline.js';
import type { Sql } from '../etl/db-utils.js';
import { gunzipRequestTimeline, gzipRequestTimelineParts } from '../etl/request-timeline-codec.js';
import { uploadTraceReplayPayloadChunks } from '../etl/trace-replay-ingest.js';
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
  legacy_count: number | null;
}

/**
 * Set a row's legacy `request_timeline` JSONB to null after re-reading its
 * stored gzip copy, decoding it, and checking its version and request count
 * against the scalar columns and, when the legacy copy is also current,
 * against the legacy array length. Throws, keeping the JSONB, on any mismatch.
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
      case
        when (request_timeline->>'version')::int = ${REQUEST_TIMELINE_VERSION}
          and jsonb_typeof(request_timeline->'requests') = 'array'
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

  const gz = await readRequestTimelineGz(sql, traceReplayId, row.gz_bytes);
  let timeline: RequestTimeline | null;
  try {
    timeline = gz ? gunzipRequestTimeline(gz) : null;
  } catch {
    timeline = null;
  }
  if (
    timeline?.version !== REQUEST_TIMELINE_VERSION ||
    timeline.requests.length !== row.request_count
  ) {
    throw new Error('stored gzip request timeline failed verification; legacy JSONB kept');
  }
  if (row.legacy_count !== null && row.legacy_count !== row.request_count) {
    throw new Error(
      `gzip holds ${row.request_count} requests but legacy JSONB holds ` +
        `${row.legacy_count}; legacy JSONB kept`,
    );
  }

  // Clear only the gzip copy that was just verified.
  await sql`
    update agentic_trace_replay
    set request_timeline = null
    where id = ${traceReplayId}
      and request_timeline_version = ${REQUEST_TIMELINE_VERSION}
      and request_count = ${row.request_count}
      and octet_length(request_timeline_gz) = ${row.gz_bytes}
  `;
}
