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
import Assembler from 'stream-json/assembler.js';
import type { Token } from 'stream-json/parser.js';
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

function isValueStart(token: Token): boolean {
  return (
    token.name === 'startObject' ||
    token.name === 'startArray' ||
    token.name === 'stringValue' ||
    token.name === 'numberValue' ||
    token.name === 'nullValue' ||
    token.name === 'trueValue' ||
    token.name === 'falseValue'
  );
}

function updateDepth(depth: number, token: Token): number {
  if (token.name === 'startObject' || token.name === 'startArray') return depth + 1;
  if (token.name === 'endObject' || token.name === 'endArray') return depth - 1;
  return depth;
}

/**
 * Consume the parser token stream once and assemble only selected direct
 * children of the two metric phase objects. Unselected metric subtrees still
 * have to be tokenized so the JSON can be validated, but they are never copied
 * to secondary streams or materialized as JavaScript objects.
 */
async function streamCollectMetricPhases<T>(
  buffer: Buffer,
  wanted: ReadonlySet<string>,
): Promise<MetricPhaseMaps<T>> {
  let metrics: Record<string, T> = {};
  let warmupMetrics: Record<string, T> = {};
  let depth = 0;
  let phase: 'metrics' | 'warmup_metrics' | null = null;
  let topLevelKey: string | null = null;
  let metricKey: string | null = null;
  let valueAssembler: Assembler<T> | null = null;
  let valueTarget: Record<string, T> | null = null;
  let valueKey: string | null = null;

  // Packed-only values avoid emitting start/chunk/end tokens in addition to
  // their complete value token. This materially reduces the token count for
  // metric-heavy multi-GiB documents.
  const tokens = chain([
    Readable.from(buffer),
    createGunzip(),
    parser({
      packKeys: true,
      packStrings: true,
      packNumbers: true,
      streamKeys: false,
      streamStrings: false,
      streamNumbers: false,
    }),
  ]);

  for await (const rawToken of tokens) {
    const token = rawToken as Token;
    const depthBefore = depth;

    if (valueAssembler) {
      valueAssembler.consume(token);
      depth = updateDepth(depth, token);
      if (valueAssembler.done) {
        valueTarget![valueKey!] = valueAssembler.current as T;
        valueAssembler = null;
        valueTarget = null;
        valueKey = null;
      }
      continue;
    }

    if (token.name === 'keyValue') {
      if (depthBefore === 1) {
        topLevelKey = token.value;
      } else if (depthBefore === 2 && phase) {
        metricKey = token.value;
      }
    } else if (isValueStart(token)) {
      if (depthBefore === 1 && topLevelKey !== null) {
        if (token.name === 'startObject' && topLevelKey === 'metrics') {
          metrics = {};
          phase = 'metrics';
        } else if (token.name === 'startObject' && topLevelKey === 'warmup_metrics') {
          warmupMetrics = {};
          phase = 'warmup_metrics';
        }
        topLevelKey = null;
      } else if (depthBefore === 2 && phase && metricKey !== null) {
        if (wanted.has(metricKey)) {
          valueTarget = phase === 'metrics' ? metrics : warmupMetrics;
          valueKey = metricKey;
          valueAssembler = new Assembler<T>();
          valueAssembler.consume(token);
          if (valueAssembler.done) {
            valueTarget[valueKey] = valueAssembler.current as T;
            valueAssembler = null;
            valueTarget = null;
            valueKey = null;
          }
        }
        metricKey = null;
      }
    }

    depth = updateDepth(depth, token);
    if (phase && depth === 1 && (token.name === 'endObject' || token.name === 'endArray')) {
      phase = null;
      metricKey = null;
    }
  }

  return { metrics, warmupMetrics, complete: false };
}

/**
 * Gunzip and parse both server-metric phase blocks once. Large documents use a
 * single token consumer which materializes only the selected metric values.
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

  return await streamCollectMetricPhases<T>(buffer, wanted);
}
