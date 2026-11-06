import { Readable } from 'node:stream';
import { createGunzip, gunzipSync } from 'node:zlib';

import { chain } from 'stream-chain';
import { getManyValues, type Many, none } from 'stream-chain/defs.js';
import fixUtf8Stream from 'stream-chain/utils/fixUtf8Stream.js';

import Assembler from 'stream-json/assembler.js';
import { jsonParser, parser, type Token } from 'stream-json/parser.js';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

const MAX_IN_MEMORY_JSON_BYTES = 128 * 1024 * 1024;
const GUNZIP_CHUNK_BYTES = 64 * 1024;

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

/**
 * Collects the wanted members of the top-level `metrics` and `warmup_metrics`
 * objects without building the rest of the document. stream-json's tokenizer
 * is called once per gunzip chunk instead of behind an object-mode stream,
 * because pushing every token through a stream costs about three times the
 * tokenizing itself on multi-GiB AIPerf exports.
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

  const consume = (token: Token): void => {
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
      return;
    }

    // Tokens nested inside an unwanted member value only move the depth.
    if (depthBefore > 2) {
      depth = updateDepth(depth, token);
      return;
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
  };
  const consumeAll = (tokens: Many<Token> | typeof none): void => {
    if (tokens === none) return;
    for (const token of getManyValues(tokens)) consume(token);
  };

  // The two stages parser() composes: UTF-8 decoding across chunk boundaries,
  // then the tokenizer. Passing `none` flushes each stage.
  const decodeUtf8 = fixUtf8Stream();
  const tokenize = jsonParser({
    packKeys: true,
    packStrings: true,
    packNumbers: true,
    streamKeys: false,
    streamStrings: false,
    streamNumbers: false,
  });
  const gunzipped = Readable.from(buffer).pipe(createGunzip({ chunkSize: GUNZIP_CHUNK_BYTES }));
  for await (const chunk of gunzipped) consumeAll(tokenize(decodeUtf8(chunk as Buffer)));
  consumeAll(tokenize(decodeUtf8(none)));
  // Flushable<I, O> types only the data argument. Like every flushable() stage,
  // the tokenizer also takes `none` to flush and to reject truncated input.
  const flushTokenizer = tokenize as unknown as (end: typeof none) => Many<Token> | typeof none;
  consumeAll(flushTokenizer(none));

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
