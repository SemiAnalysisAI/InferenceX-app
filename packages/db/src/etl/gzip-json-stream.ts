/**
 * Shared stream-parse helpers for gzipped server-metrics blobs.
 *
 * `gunzipSync(buffer).toString('utf8')` trips Node's 512 MB max-string-length
 * cap on high-conc TP+EP rows, so the compute-* ETL helpers fall back to a
 * stream-json pipeline that collects only the top-level subtrees they need.
 * Both the fast-path error detection and the pipeline itself live here so
 * chart-series and aggregate-stats stay byte-identical in how they parse.
 */

import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { chain } from 'stream-chain';

import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

/**
 * True when `error` is Node's max-string-length failure (`ERR_STRING_TOO_LONG`
 * or the older message-only variant) — the signal to switch from
 * `gunzipSync().toString()` to the streaming parser.
 */
export function isStringTooLongError(error: unknown): boolean {
  const code = error && (error as NodeJS.ErrnoException).code;
  const msg = error instanceof Error ? error.message : String(error);
  return code === 'ERR_STRING_TOO_LONG' || msg.includes('longer than 0x1fffffe8');
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
