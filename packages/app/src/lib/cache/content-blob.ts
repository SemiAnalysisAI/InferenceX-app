import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import { after } from 'next/server';

import { cachedJsonBytes, cdnHeaders, negotiateEncoding } from './api-cache';
import { contentBlobUrl, putContentBlob } from './blob-cache';

const gzipAsync = promisify(gzip);

export function contentBlobKey(namespace: string, sha256: string): string {
  return `${namespace}/${sha256}.json.gz`;
}

export function contentBlobKeyOf(namespace: string, inputs: readonly string[]): string {
  return contentBlobKey(namespace, createHash('sha256').update(inputs.join('\n')).digest('hex'));
}

function warnStoreFailure(key: string, error: unknown): void {
  console.warn(
    `[content blob] could not store ${key}. ${error instanceof Error ? error.message : String(error)}`,
  );
}

export async function contentBlobRedirect(request: Request, key: string): Promise<Response | null> {
  const url = contentBlobUrl(key);
  if (!url) return null;
  if (negotiateEncoding(request.headers.get('Accept-Encoding'), ['gzip', 'identity']) !== 'gzip') {
    return null;
  }
  try {
    const stored = await fetch(url, { method: 'HEAD' });
    if (!stored.ok) return null;
  } catch {
    return null;
  }
  return new Response(null, {
    status: 307,
    headers: { Location: url, Vary: 'Accept-Encoding', ...cdnHeaders() },
  });
}

export function cachedJsonStoringContentBlob(
  request: Request,
  data: unknown,
  key: string | null,
): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (key && contentBlobUrl(key)) {
    after(async () => {
      try {
        await putContentBlob(key, await gzipAsync(bytes));
      } catch (error) {
        warnStoreFailure(key, error);
      }
    });
  }
  return cachedJsonBytes(request, bytes);
}

export function copyingToContentBlob(
  chunks: AsyncIterable<Uint8Array>,
  key: string,
  sha256: string,
): AsyncIterable<Uint8Array> {
  if (!contentBlobUrl(key)) return chunks;
  let copy!: ReadableStreamDefaultController<Uint8Array>;
  let copying = true;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      copy = controller;
    },
    cancel() {
      copying = false;
    },
  });
  after(
    putContentBlob(key, body).catch((error: unknown) => {
      copying = false;
      copy.error(error);
      warnStoreFailure(key, error);
    }),
  );
  return (async function* copyingChunks() {
    const hash = createHash('sha256');
    let verified = false;
    try {
      for await (const chunk of chunks) {
        hash.update(chunk);
        if (copying) copy.enqueue(chunk);
        yield chunk;
      }
      verified = hash.digest('hex') === sha256;
    } finally {
      if (copying) {
        if (verified) copy.close();
        else copy.error(new Error(`${key} was not copied whole`));
      }
    }
  })();
}
