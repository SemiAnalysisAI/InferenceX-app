/**
 * Storage codec for `agentic_trace_replay.request_timeline_gz`: gzip of the
 * JSON text of one versioned {@link RequestTimeline} document.
 *
 * Encoding streams the JSON into gzip in batches of requests, so neither an
 * ingest worker nor the legacy-JSONB conversion backfill holds the complete
 * serialized document (about 200 million characters for a 460,000-request
 * run) next to the request objects it was built from. Readers that need only a
 * few fields of each request scan the document instead of parsing all of it.
 */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip, gunzipSync } from 'node:zlib';

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import type { Token } from 'stream-json/parser.js';

import type { RequestRecord, RequestTimeline } from './compute-request-timeline';
import { gunzipJsonWithinLimit } from './gzip-json-stream';

/** JSON characters accumulated before each write into the gzip stream. */
const JSON_BATCH_CHARS = 1024 * 1024;

/**
 * Largest decompressed timeline a scan decodes in one piece. Scans run in
 * request-serving functions, where a parsed request costs about as much heap
 * as its JSON text on top of the text and the gunzip buffer. This ceiling is
 * therefore lower than the 128 MiB one ingest uses for server metrics, and
 * larger timelines are tokenized as a stream.
 */
export const REQUEST_TIMELINE_IN_MEMORY_JSON_BYTES = 16 * 1024 * 1024;

/** Emit complete values only, without start/chunk/end tokens around them. */
const PACKED_TOKENS = {
  packKeys: true,
  packStrings: true,
  packNumbers: true,
  streamKeys: false,
  streamStrings: false,
  streamNumbers: false,
};

export interface GzippedRequestTimeline {
  gz: Buffer;
  /** Number of request records written into the document's `requests` array. */
  requestCount: number;
}

/** The fields of one request that a scan passes on. */
export type ScannedRequest = Partial<Record<keyof RequestRecord, unknown>>;

/** A timeline's top-level scalars. */
export type RequestTimelineHeader = Partial<
  Record<Exclude<keyof RequestTimeline, 'requests'>, unknown>
>;

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

/** Parse timeline JSON text. Throws unless it is an object with a `requests` array. */
export function parseRequestTimelineJson(json: string): RequestTimeline {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('requests' in parsed) ||
    !Array.isArray(parsed.requests)
  ) {
    throw new Error('request timeline has no requests array');
  }
  // The request records themselves are not re-validated on every read: the
  // gzip writers above and the legacy JSONB writers all serialized this type.
  const timeline = parsed as RequestTimeline;
  return timeline;
}

/** Decode a stored `request_timeline_gz` value. Throws on corrupt input. */
export function gunzipRequestTimeline(gz: Uint8Array): RequestTimeline {
  return parseRequestTimelineJson(gunzipSync(gz).toString('utf8'));
}

function notAnObjectError(): Error {
  return new Error('request timeline holds a request that is not an object');
}

/**
 * Consume parser tokens of one timeline document, holding at most one request
 * at a time and only its selected fields.
 */
async function scanTimelineTokens(
  tokens: AsyncIterable<unknown>,
  fields: ReadonlySet<string>,
  onRequest: (request: ScannedRequest) => void,
): Promise<RequestTimelineHeader> {
  const header: Record<string, unknown> = {};
  let depth = 0;
  let topLevelKey: string | null = null;
  let inRequests = false;
  let foundRequests = false;
  let request: Record<string, unknown> | null = null;
  let requestKey: string | null = null;

  for await (const rawToken of tokens) {
    const token = rawToken as Token;
    switch (token.name) {
      case 'keyValue': {
        if (depth === 1) topLevelKey = token.value;
        else if (depth === 3 && request) requestKey = token.value;
        break;
      }
      case 'startObject': {
        if (inRequests && depth === 2) request = {};
        depth += 1;
        break;
      }
      case 'startArray': {
        if (inRequests && depth === 2) throw notAnObjectError();
        if (depth === 1 && topLevelKey === 'requests') {
          inRequests = true;
          foundRequests = true;
        }
        depth += 1;
        break;
      }
      case 'endObject':
      case 'endArray': {
        depth -= 1;
        if (request && depth === 2) {
          onRequest(request);
          request = null;
        } else if (inRequests && depth === 1) {
          inRequests = false;
        }
        break;
      }
      case 'stringValue':
      case 'numberValue':
      case 'nullValue':
      case 'trueValue':
      case 'falseValue': {
        const value = token.name === 'numberValue' ? Number(token.value) : token.value;
        if (depth === 1 && topLevelKey !== null) {
          header[topLevelKey] = value;
        } else if (inRequests && depth === 2) {
          throw notAnObjectError();
        } else if (request && depth === 3 && requestKey !== null && fields.has(requestKey)) {
          request[requestKey] = value;
        }
        break;
      }
      default: {
        break;
      }
    }
  }
  if (!foundRequests) throw new Error('request timeline has no requests array');
  return header;
}

/**
 * Tokenize timeline JSON text, such as bounded chunks of a legacy JSONB
 * timeline, and pass the `fields` of each request to `onRequest`. Never holds
 * the document or more than one request. Returns the top-level scalars, and
 * throws on malformed JSON, a missing `requests` array, or a non-object request.
 */
export function scanRequestTimelineText(
  text: AsyncIterable<string | Uint8Array>,
  fields: ReadonlySet<string>,
  onRequest: (request: ScannedRequest) => void,
): Promise<RequestTimelineHeader> {
  return scanTimelineTokens(chain([Readable.from(text), parser(PACKED_TOKENS)]), fields, onRequest);
}

/**
 * Decode a stored `request_timeline_gz` value and pass each request to
 * `onRequest`. Timelines up to `maxInMemoryBytes` of JSON are parsed in one
 * piece. Larger ones are gunzipped and tokenized as a stream, and their
 * requests carry only `fields`. Throws on corrupt gzip or JSON.
 */
export async function scanRequestTimelineGz(
  gz: Buffer,
  fields: ReadonlySet<string>,
  onRequest: (request: ScannedRequest) => void,
  maxInMemoryBytes = REQUEST_TIMELINE_IN_MEMORY_JSON_BYTES,
): Promise<RequestTimelineHeader> {
  const json = gunzipJsonWithinLimit(gz, maxInMemoryBytes);
  if (json === null) {
    return await scanTimelineTokens(
      chain([Readable.from([gz]), createGunzip(), parser(PACKED_TOKENS)]),
      fields,
      onRequest,
    );
  }

  const { requests, ...header } = parseRequestTimelineJson(json);
  for (const request of requests) {
    // Parsed data: confirm each element is an object, as the token scan does.
    const value: unknown = request;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw notAnObjectError();
    }
    onRequest(request);
  }
  return header;
}
