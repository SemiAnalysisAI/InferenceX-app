/**
 * Storage codec for `agentic_trace_replay.request_timeline_gz`: gzip of the
 * JSON text of one versioned {@link RequestTimeline} document.
 *
 * Encoding streams the JSON into gzip in batches of requests, so neither an
 * ingest worker nor the legacy-JSONB conversion backfill holds the complete
 * serialized document (about 200 million characters for a 460,000-request
 * run) next to the request objects it was built from.
 */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, gunzipSync } from 'node:zlib';

import type { RequestTimeline } from './compute-request-timeline';

/** JSON characters accumulated before each write into the gzip stream. */
const JSON_BATCH_CHARS = 1024 * 1024;

export interface GzippedRequestTimeline {
  gz: Buffer;
  /** Number of request records written into the document's `requests` array. */
  requestCount: number;
}

/**
 * Yield `{...header, "requests": [...]}` as JSON text. When `requests` is the
 * timeline's last key, the concatenated text equals `JSON.stringify(timeline)`.
 */
async function* timelineJsonText(
  header: object,
  requests: Iterable<object> | AsyncIterable<object>,
  counter: { requests: number },
): AsyncGenerator<string> {
  const headerJson = JSON.stringify(header);
  let text = headerJson === '{}' ? '{"requests":[' : `${headerJson.slice(0, -1)},"requests":[`;
  for await (const request of requests) {
    if (counter.requests > 0) text += ',';
    text += JSON.stringify(request);
    counter.requests += 1;
    if (text.length >= JSON_BATCH_CHARS) {
      yield text;
      text = '';
    }
  }
  yield `${text}]}`;
}

/**
 * Gzip a timeline document whose requests may arrive incrementally, such as
 * index-range slices of a legacy JSONB array. A failing request source rejects
 * the returned promise.
 */
export async function gzipRequestTimelineParts(
  header: object,
  requests: Iterable<object> | AsyncIterable<object>,
): Promise<GzippedRequestTimeline> {
  const counter = { requests: 0 };
  const chunks: Buffer[] = [];
  await pipeline(
    Readable.from(timelineJsonText(header, requests, counter)),
    createGzip({ chunkSize: 1024 * 1024 }),
    async (compressed: AsyncIterable<Buffer>) => {
      for await (const chunk of compressed) chunks.push(chunk);
    },
  );
  return { gz: Buffer.concat(chunks), requestCount: counter.requests };
}

/** `gzip(JSON.stringify(timeline))` for the `request_timeline_gz` column. */
export async function gzipRequestTimeline(timeline: RequestTimeline): Promise<Buffer> {
  const { requests, ...header } = timeline;
  const { gz } = await gzipRequestTimelineParts(header, requests);
  return gz;
}

/** Decode a stored `request_timeline_gz` value. Throws on corrupt input. */
export function gunzipRequestTimeline(gz: Uint8Array): RequestTimeline {
  const parsed: unknown = JSON.parse(gunzipSync(gz).toString('utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('requests' in parsed) ||
    !Array.isArray(parsed.requests)
  ) {
    throw new Error('request_timeline_gz does not hold a timeline with a requests array');
  }
  // Only the gzip writers above produce this column, so the request records
  // themselves are not re-validated on every read.
  const timeline = parsed as RequestTimeline;
  return timeline;
}
