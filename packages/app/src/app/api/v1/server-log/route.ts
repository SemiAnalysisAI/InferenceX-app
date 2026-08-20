import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getServerLog, getServerLogChunk } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedServerLog = cachedQuery((id: number) => getServerLog(getDb(), id), 'server-log', {
  blobOnly: true,
});
const getCachedNamedServerLog = cachedQuery(
  (id: number, fileName: string) => getServerLog(getDb(), id, fileName),
  'server-log-file',
  { blobOnly: true },
);
const getCachedServerLogChunk = cachedQuery(
  (id: number, offset: number, limit: number, fileName: string | null) =>
    getServerLogChunk(getDb(), id, offset, limit, fileName ?? undefined),
  'server-log-chunk',
);

export const DEFAULT_SERVER_LOG_CHUNK_SIZE = 64 * 1024;
export const MAX_SERVER_LOG_CHUNK_SIZE = 256 * 1024;
const MAX_SERVER_LOG_OFFSET = 2_000_000_000;
const MAX_SERVER_LOG_FILE_NAME_LENGTH = 1024;

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
    return NextResponse.json({ error: 'id is required (benchmark_result_id)' }, { status: 400 });
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
      const firstChunk = await getCachedServerLogChunk(id, 0, MAX_SERVER_LOG_CHUNK_SIZE, fileName);
      if (firstChunk === null) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const encoder = new TextEncoder();
      let nextOffset = firstChunk.nextOffset;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (firstChunk.serverLog.length > 0) {
            controller.enqueue(encoder.encode(firstChunk.serverLog));
          }
          if (nextOffset === null) controller.close();
        },
        async pull(controller) {
          if (nextOffset === null) return;
          try {
            const chunk = await getCachedServerLogChunk(
              id,
              nextOffset,
              MAX_SERVER_LOG_CHUNK_SIZE,
              fileName,
            );
            if (chunk === null) {
              controller.error(new Error('Log file disappeared during download'));
              return;
            }
            if (chunk.serverLog.length > 0) {
              controller.enqueue(encoder.encode(chunk.serverLog));
            }
            nextOffset = chunk.nextOffset;
            if (nextOffset === null) controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, max-age=0',
          'Content-Disposition': downloadFileName(fileName ?? 'server.log'),
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
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
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return cachedJson({ id, ...chunk });
    }

    const serverLog =
      fileName === null
        ? await getCachedServerLog(id)
        : await getCachedNamedServerLog(id, fileName);

    if (serverLog === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return cachedJson(fileName === null ? { id, serverLog } : { id, fileName, serverLog });
  } catch (error) {
    console.error('Error fetching server log:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
