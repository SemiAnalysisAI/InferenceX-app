import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getBoundedServerLog,
  getServerLogChunk,
  type ServerLogChunk,
} from '@semianalysisai/inferencex-db/queries/server-logs';

import {
  cachedJson,
  cachedQuery,
  cdnHeaders,
  SERVER_LOG_CACHE_CONTROL,
  serverLogCacheTag,
} from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Largest file returned as one JSON string; larger files need chunks or download=1. */
export const MAX_COMPLETE_SERVER_LOG_BYTES = 16 * 1024 * 1024;
/**
 * Largest file streamed by download=1. A read at character offset N makes
 * PostgreSQL decompress the first N characters, so streaming costs grow with
 * the square of the file size; 512 MiB finishes in about two minutes.
 */
export const MAX_DOWNLOAD_SERVER_LOG_BYTES = 512 * 1024 * 1024;
/**
 * Characters per database read while streaming a download. Worst-case JSON
 * escaping is 6 bytes per character, so one read stays under Neon's 64 MB
 * response cap, and a 512 MiB file needs about 64 reads instead of 2,000.
 */
export const DOWNLOAD_CHUNK_CHARACTERS = 8 * 1024 * 1024;

export const DEFAULT_SERVER_LOG_CHUNK_SIZE = 64 * 1024;
export const MAX_SERVER_LOG_CHUNK_SIZE = 256 * 1024;
const MAX_SERVER_LOG_OFFSET = 2_000_000_000;
const MAX_SERVER_LOG_FILE_NAME_LENGTH = 1024;

const getCachedBoundedServerLog = cachedQuery(
  (id: number, maxBytes: number, fileName: string | null) =>
    getBoundedServerLog(getDb(), id, maxBytes, fileName ?? undefined),
  'server-log-bounded',
  { blobOnly: true },
);
const getCachedServerLogChunk = cachedQuery(
  (id: number, offset: number, limit: number, fileName: string | null) =>
    getServerLogChunk(getDb(), id, offset, limit, fileName ?? undefined),
  'server-log-chunk',
);

function logCacheOptions() {
  return { tag: serverLogCacheTag(), cacheControl: SERVER_LOG_CACHE_CONTROL };
}

function tooLargeResponse(bytes: number, maxBytes: number, hint: string): Response {
  return Response.json(
    {
      error: `Log file is ${bytes} bytes, above the ${maxBytes}-byte limit for this mode. ${hint}`,
      bytes,
      maxBytes,
    },
    { status: 413, headers: cdnHeaders(serverLogCacheTag(), SERVER_LOG_CACHE_CONTROL) },
  );
}

function downloadStream(
  id: number,
  fileName: string | null,
  first: ServerLogChunk,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let nextOffset = first.nextOffset;
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        if (first.serverLog.length > 0) controller.enqueue(encoder.encode(first.serverLog));
        if (nextOffset === null) controller.close();
      },
      async pull(controller) {
        if (nextOffset === null) return;
        try {
          const chunk = await getServerLogChunk(
            getDb(),
            id,
            nextOffset,
            DOWNLOAD_CHUNK_CHARACTERS,
            fileName ?? undefined,
          );
          if (chunk === null) {
            controller.error(new Error('Log file disappeared during download'));
            return;
          }
          if (chunk.serverLog.length > 0) controller.enqueue(encoder.encode(chunk.serverLog));
          nextOffset = chunk.nextOffset;
          if (nextOffset === null) controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    },
    { highWaterMark: 0 },
  );
}

function downloadFileName(fileName: string): string {
  const leafName = fileName.replaceAll('\\', '/').split('/').at(-1) || 'server.log';
  const asciiName = [...leafName]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint <= 126 && character !== '"' && character !== '\\'
        ? character
        : '_';
    })
    .join('')
    .slice(0, 180);
  const encodedName = encodeURIComponent(leafName).replaceAll(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`,
  );
  return `attachment; filename="${asciiName || 'server.log'}"; filename*=UTF-8''${encodedName}`;
}

function parseIntegerParam(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get('id'));

  if (!id || !Number.isFinite(id)) {
    return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
  }

  try {
    const fileName = request.nextUrl.searchParams.get('file');
    if (
      fileName !== null &&
      (fileName.length === 0 ||
        fileName.length > MAX_SERVER_LOG_FILE_NAME_LENGTH ||
        fileName.includes('\u0000'))
    ) {
      return NextResponse.json({ error: 'file is invalid' }, { status: 400 });
    }
    const wantsChunk =
      request.nextUrl.searchParams.has('offset') || request.nextUrl.searchParams.has('limit');
    const download = request.nextUrl.searchParams.get('download');
    if ((download !== null && download !== '1') || (download === '1' && wantsChunk)) {
      return NextResponse.json(
        { error: 'download must be 1 and cannot be combined with offset or limit' },
        { status: 400 },
      );
    }

    if (download === '1') {
      // One query sizes the file and, for most files, returns it whole.
      const whole = await getBoundedServerLog(
        getDb(),
        id,
        DOWNLOAD_CHUNK_CHARACTERS,
        fileName ?? undefined,
      );
      if (whole === null) {
        return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
      }
      if (whole.bytes > MAX_DOWNLOAD_SERVER_LOG_BYTES) {
        return tooLargeResponse(
          whole.bytes,
          MAX_DOWNLOAD_SERVER_LOG_BYTES,
          'Read it in ranges with offset and limit.',
        );
      }
      const first: ServerLogChunk | null =
        whole.serverLog === null
          ? await getServerLogChunk(
              getDb(),
              id,
              0,
              DOWNLOAD_CHUNK_CHARACTERS,
              fileName ?? undefined,
            )
          : { fileName: whole.fileName, serverLog: whole.serverLog, offset: 0, nextOffset: null };
      if (first === null) {
        return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
      }
      return new Response(downloadStream(id, fileName, first), {
        headers: {
          ...cdnHeaders(serverLogCacheTag(), SERVER_LOG_CACHE_CONTROL),
          'Content-Disposition': downloadFileName(fileName ?? whole.fileName),
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    if (wantsChunk) {
      const offset = parseIntegerParam(
        request.nextUrl.searchParams.get('offset'),
        0,
        0,
        MAX_SERVER_LOG_OFFSET,
      );
      const limit = parseIntegerParam(
        request.nextUrl.searchParams.get('limit'),
        DEFAULT_SERVER_LOG_CHUNK_SIZE,
        1,
        MAX_SERVER_LOG_CHUNK_SIZE,
      );
      if (offset === null || limit === null) {
        return NextResponse.json(
          {
            error: `offset must be 0-${MAX_SERVER_LOG_OFFSET}; limit must be 1-${MAX_SERVER_LOG_CHUNK_SIZE}`,
          },
          { status: 400 },
        );
      }

      const chunk = await getCachedServerLogChunk(id, offset, limit, fileName);
      if (chunk === null) {
        return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
      }
      return cachedJson(request, { id, ...chunk }, logCacheOptions());
    }

    const log = await getCachedBoundedServerLog(id, MAX_COMPLETE_SERVER_LOG_BYTES, fileName);
    if (log === null) {
      return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
    }
    if (log.serverLog === null) {
      return tooLargeResponse(
        log.bytes,
        MAX_COMPLETE_SERVER_LOG_BYTES,
        'Read it with offset and limit, or stream it with download=1.',
      );
    }
    const serverLog = log.serverLog;
    return cachedJson(
      request,
      fileName === null ? { id, serverLog } : { id, fileName, serverLog },
      logCacheOptions(),
    );
  } catch (error) {
    console.error('Error fetching server log:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
