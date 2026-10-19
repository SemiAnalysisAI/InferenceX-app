import { Readable } from 'node:stream';
import { createGunzip, gunzipSync } from 'node:zlib';

import { chain } from 'stream-chain';

import { parser } from 'stream-json';
import Assembler from 'stream-json/assembler.js';
import type { Token } from 'stream-json/parser.js';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

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
