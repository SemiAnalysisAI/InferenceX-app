import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip, gunzipSync } from 'node:zlib';

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import type { Token } from 'stream-json/parser.js';

import type { RequestRecord, RequestTimeline } from './compute-request-timeline';
import { gunzipJsonWithinLimit } from './gzip-json-stream';

const JSON_BATCH_CHARS = 1024 * 1024;

export const REQUEST_TIMELINE_IN_MEMORY_JSON_BYTES = 16 * 1024 * 1024;

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
  requestCount: number;
}

export type ScannedRequest = Partial<Record<keyof RequestRecord, unknown>>;

export type RequestTimelineHeader = Partial<
  Record<Exclude<keyof RequestTimeline, 'requests'>, unknown>
>;

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

export async function gzipRequestTimeline(timeline: RequestTimeline): Promise<Buffer> {
  const { requests, ...header } = timeline;
  const { gz } = await gzipRequestTimelineParts(header, requests);
  return gz;
}

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
  const timeline = parsed as RequestTimeline;
  return timeline;
}

export function gunzipRequestTimeline(gz: Uint8Array): RequestTimeline {
  return parseRequestTimelineJson(gunzipSync(gz).toString('utf8'));
}

function notAnObjectError(): Error {
  return new Error('request timeline holds a request that is not an object');
}

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

export function scanRequestTimelineText(
  text: AsyncIterable<string | Uint8Array>,
  fields: ReadonlySet<string>,
  onRequest: (request: ScannedRequest) => void,
): Promise<RequestTimelineHeader> {
  return scanTimelineTokens(chain([Readable.from(text), parser(PACKED_TOKENS)]), fields, onRequest);
}

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
    const value: unknown = request;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw notAnObjectError();
    }
    onRequest(request);
  }
  return header;
}
