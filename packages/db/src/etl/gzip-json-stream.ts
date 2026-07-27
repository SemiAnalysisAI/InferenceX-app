/**
 * Shared bounded and streaming parsers for gzipped server-metrics blobs.
 *
 * High-conc TP+EP rows can exceed 500 MB when decompressed. The bounded
 * synchronous helper preserves the historical Node string-size guard when
 * these scripts run under runtimes with larger string limits, while the
 * stream-json pipeline collects only the top-level subtrees callers need.
 */

import { Readable } from 'node:stream';
import { createGunzip, gunzipSync } from 'node:zlib';

import { chain } from 'stream-chain';

import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

/** Bound peak memory while retaining the fast path for ordinary metric blobs. */
const MAX_IN_MEMORY_JSON_BYTES = 128 * 1024 * 1024;

function isSizeLimitError(error: unknown): boolean {
  const code = error && (error as NodeJS.ErrnoException).code;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'ERR_BUFFER_TOO_LARGE' ||
    code === 'ERR_STRING_TOO_LONG' ||
    msg.includes('longer than 0x1fffffe8')
  );
}

/**
 * Gunzip a JSON blob only while its output stays within the in-memory fast-path
 * ceiling. Returns null when the caller must use the streaming parser instead.
 */
export function gunzipJsonWithinLimit(
  buffer: Buffer,
  maxOutputLength = MAX_IN_MEMORY_JSON_BYTES,
): string | null {
  try {
    return gunzipSync(buffer, { maxOutputLength }).toString('utf8');
  } catch (error) {
    if (isSizeLimitError(error)) return null;
    throw error;
  }
}

/**
 * Gunzip + stream-parse `buffer`, descending into the top-level `filter` key
 * (e.g. `metrics` / `warmup_metrics`) and collecting only the child entries
 * whose key is in `wanted`. Never materializes the full JSON string.
 */
export async function streamCollectKeys<T>(
  buffer: Buffer,
  filter: string,
  wanted: ReadonlySet<string>,
): Promise<Record<string, T>> {
  const collected: Record<string, T> = {};
  const pipeline = chain([
    Readable.from(buffer),
    createGunzip(),
    parser(),
    pick({ filter }),
    streamObject(),
  ]);
  await new Promise<void>((resolve, reject) => {
    pipeline.on('data', (chunk: unknown) => {
      const { key, value } = chunk as { key: string; value: T };
      if (wanted.has(key)) collected[key] = value;
    });
    pipeline.on('end', resolve);
    pipeline.on('error', reject);
  });
  return collected;
}
