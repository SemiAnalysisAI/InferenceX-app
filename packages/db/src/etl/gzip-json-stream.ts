/**
 * Shared bounded and streaming parsers for gzipped server-metrics blobs.
 *
 * High-conc TP+EP rows can exceed 500 MB when decompressed. The bounded
 * synchronous helper preserves the historical Node string-size guard when
 * these scripts run under runtimes with larger string limits, while the
 * stream-json pipeline collects only the top-level subtrees callers need.
 */

import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
  const metricStream = chain([
    Readable.from(buffer),
    createGunzip(),
    parser(),
    pick({ filter }),
    streamObject(),
  ]);
  await new Promise<void>((resolve, reject) => {
    metricStream.on('data', (chunk: unknown) => {
      const { key, value } = chunk as { key: string; value: T };
      if (wanted.has(key)) collected[key] = value;
    });
    metricStream.on('end', resolve);
    metricStream.on('error', reject);
  });
  return collected;
}

export interface MetricPhaseMaps<T> {
  metrics: Record<string, T>;
  warmupMetrics: Record<string, T>;
  /** True when the bounded fast path retained every metric in the document. */
  complete: boolean;
}

async function collectTokenBranch<T>(
  input: PassThrough,
  filter: 'metrics' | 'warmup_metrics',
  wanted: ReadonlySet<string>,
): Promise<Record<string, T>> {
  const collected: Record<string, T> = {};
  const output = chain([input, pick({ filter }), streamObject()]);
  for await (const chunk of output) {
    const { key, value } = chunk as { key: string; value: T };
    if (wanted.has(key)) collected[key] = value;
  }
  return collected;
}

/**
 * Gunzip and parse both server-metric phase blocks once. Large documents fan
 * the parser's token stream out to two lightweight selectors, avoiding one
 * complete decompression + JSON tokenization pass per phase.
 */
export async function collectMetricPhases<T>(
  buffer: Buffer,
  wanted: ReadonlySet<string>,
  maxInMemoryBytes = MAX_IN_MEMORY_JSON_BYTES,
): Promise<MetricPhaseMaps<T>> {
  const json = gunzipJsonWithinLimit(buffer, maxInMemoryBytes);
  if (json !== null) {
    const parsed = JSON.parse(json) as {
      metrics?: Record<string, T>;
      warmup_metrics?: Record<string, T>;
    };
    return {
      metrics: parsed.metrics ?? {},
      warmupMetrics: parsed.warmup_metrics ?? {},
      complete: true,
    };
  }

  // Attach every branch before starting the source pipeline so no parser
  // tokens can be missed. PassThrough backpressure keeps the two consumers in
  // lockstep without buffering the full document.
  const profilingInput = new PassThrough({ objectMode: true });
  const warmupInput = new PassThrough({ objectMode: true });
  const tokenTee = new PassThrough({ objectMode: true });
  tokenTee.pipe(profilingInput);
  tokenTee.pipe(warmupInput);

  const profiling = collectTokenBranch<T>(profilingInput, 'metrics', wanted);
  const warmup = collectTokenBranch<T>(warmupInput, 'warmup_metrics', wanted);
  const tokens = chain([Readable.from(buffer), createGunzip(), parser()]);

  try {
    const [, metrics, warmupMetrics] = await Promise.all([
      pipeline(tokens, tokenTee),
      profiling,
      warmup,
    ]);
    return { metrics, warmupMetrics, complete: false };
  } catch (error) {
    tokenTee.destroy();
    profilingInput.destroy();
    warmupInput.destroy();
    throw error;
  }
}
