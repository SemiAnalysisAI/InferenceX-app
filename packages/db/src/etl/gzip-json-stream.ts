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

export async function streamCollectMetricPhases<T>(
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

const TOP_KEY_LINE = Buffer.from('\n  "');
const MEMBER_LINE = Buffer.from('\n    "');
const PHASE_END_LINE = Buffer.from('\n  }');
const PRETTY_SCAN_CHUNK_BYTES = 1024 * 1024;
const MAX_KEY_LINE_BYTES = 1024 * 1024;
const END_TAIL_BYTES = 64;

type MetricPhase = 'metrics' | 'warmup_metrics';

function isJsonWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0A || byte === 0x0D || byte === 0x09;
}

function startsWithAt(buf: Buffer, at: number, prefix: Buffer): boolean {
  return prefix.equals(buf.subarray(at, at + prefix.length));
}

// undefined means the key line continues past the end of buf.
function parseKeyLine(
  buf: Buffer,
  quoteAt: number,
): { key: string; valueAt: number } | null | undefined {
  let end = quoteAt + 1;
  while (end < buf.length && buf[end] !== 0x22) end += buf[end] === 0x5C ? 2 : 1;
  if (end >= buf.length) return undefined;
  let at = end + 1;
  while (at < buf.length && buf[at] === 0x20) at++;
  if (at >= buf.length) return undefined;
  if (buf[at] !== 0x3A) return null;
  at++;
  while (at < buf.length && buf[at] === 0x20) at++;
  if (at + 1 >= buf.length) return undefined;
  try {
    return { key: JSON.parse(buf.toString('utf8', quoteAt, end + 1)) as string, valueAt: at };
  } catch {
    return null;
  }
}

function parseMemberValue(parts: Buffer[], hasNextMember: boolean): unknown {
  const bytes = parts.length === 1 ? parts[0]! : Buffer.concat(parts);
  let end = bytes.length;
  while (end > 0 && isJsonWhitespace(bytes[end - 1]!)) end--;
  if ((bytes[end - 1] === 0x2C) !== hasNextMember) throw new Error('Unexpected member separator');
  return JSON.parse(bytes.toString('utf8', 0, hasNextMember ? end - 1 : end));
}

/**
 * Scans AIPerf's 2-space pretty-printed layout without tokenizing it. Raw
 * newlines only separate tokens, so `\n  "` starts a top-level key, `\n    "`
 * starts a phase member and `\n  }` closes a phase. Returns null when the
 * layout is not recognized so the caller can use the token stream instead.
 */
export async function scanPrettyMetricPhases<T>(
  buffer: Buffer,
  wanted: ReadonlySet<string>,
  chunkSize = PRETTY_SCAN_CHUNK_BYTES,
): Promise<MetricPhaseMaps<T> | null> {
  const maps: Record<MetricPhase, Record<string, T>> = { metrics: {}, warmup_metrics: {} };
  const seenPhases = new Set<MetricPhase>();
  // Annotated via `as` because TS does not see the closure below reassigning mode.
  let mode = 'start' as 'start' | 'top' | 'phase';
  let target = maps.metrics;
  let inMember = false;
  let memberKey: string | null = null;
  let memberParts: Buffer[] = [];
  let carry: Buffer = Buffer.alloc(0);
  let endTail: Buffer = Buffer.alloc(0);

  const scan = (buf: Buffer): boolean => {
    let pos = 0;
    let phaseEndAt = -2;
    for (;;) {
      if (mode === 'start') {
        while (pos < buf.length && isJsonWhitespace(buf[pos]!)) pos++;
        if (pos === buf.length) {
          carry = Buffer.alloc(0);
          return true;
        }
        if (buf[pos] !== 0x7B) return false;
        if (buf.length - pos <= TOP_KEY_LINE.length) {
          carry = buf.subarray(pos);
          return true;
        }
        if (!startsWithAt(buf, pos + 1, TOP_KEY_LINE)) return false;
        mode = 'top';
        pos++;
        continue;
      }

      if (mode === 'top') {
        const at = buf.indexOf(TOP_KEY_LINE, pos);
        if (at === -1) {
          carry = buf.subarray(Math.max(pos, buf.length - TOP_KEY_LINE.length + 1));
          return true;
        }
        const line = parseKeyLine(buf, at + TOP_KEY_LINE.length - 1);
        if (line === undefined) {
          carry = buf.subarray(at);
          return carry.length <= MAX_KEY_LINE_BYTES;
        }
        if (line === null) return false;
        pos = line.valueAt;
        if (line.key !== 'metrics' && line.key !== 'warmup_metrics') continue;
        if (seenPhases.has(line.key) || buf[pos] !== 0x7B) return false;
        seenPhases.add(line.key);
        if (buf[pos + 1] === 0x7D) {
          pos += 2;
          continue;
        }
        if (buf[pos + 1] !== 0x0A) return false;
        mode = 'phase';
        target = maps[line.key];
        inMember = false;
        pos++;
        continue;
      }

      if (!inMember) {
        if (buf.length - pos < MEMBER_LINE.length) {
          carry = buf.subarray(pos);
          return true;
        }
        if (startsWithAt(buf, pos, PHASE_END_LINE)) {
          mode = 'top';
          pos += PHASE_END_LINE.length;
          continue;
        }
        if (!startsWithAt(buf, pos, MEMBER_LINE)) return false;
        const line = parseKeyLine(buf, pos + MEMBER_LINE.length - 1);
        if (line === undefined) {
          carry = buf.subarray(pos);
          return carry.length <= MAX_KEY_LINE_BYTES;
        }
        if (line === null) return false;
        inMember = true;
        memberKey = wanted.has(line.key) ? line.key : null;
        memberParts = [];
        pos = line.valueAt;
        continue;
      }

      const memberAt = buf.indexOf(MEMBER_LINE, pos);
      if (phaseEndAt === -2 || (phaseEndAt >= 0 && phaseEndAt < pos)) {
        phaseEndAt = buf.indexOf(PHASE_END_LINE, pos);
      }
      const boundary =
        memberAt !== -1 && (phaseEndAt === -1 || memberAt < phaseEndAt) ? memberAt : phaseEndAt;
      if (boundary === -1) {
        const keepFrom = Math.max(pos, buf.length - MEMBER_LINE.length + 1);
        if (memberKey !== null) memberParts.push(buf.subarray(pos, keepFrom));
        carry = buf.subarray(keepFrom);
        return true;
      }
      if (memberKey !== null) {
        memberParts.push(buf.subarray(pos, boundary));
        try {
          target[memberKey] = parseMemberValue(memberParts, boundary === memberAt) as T;
        } catch {
          return false;
        }
        memberParts = [];
      }
      inMember = false;
      pos = boundary;
    }
  };

  const gunzip = createGunzip({ chunkSize });
  gunzip.end(buffer);
  for await (const chunk of gunzip as AsyncIterable<Buffer>) {
    endTail =
      chunk.length >= END_TAIL_BYTES
        ? chunk.subarray(-END_TAIL_BYTES)
        : Buffer.concat([endTail, chunk]).subarray(-END_TAIL_BYTES);
    if (!scan(carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk)) return null;
  }

  if (mode !== 'top') return null;
  let end = endTail.length;
  while (end > 0 && isJsonWhitespace(endTail[end - 1]!)) end--;
  if (end < 2 || endTail[end - 1] !== 0x7D || endTail[end - 2] !== 0x0A) return null;
  return { metrics: maps.metrics, warmupMetrics: maps.warmup_metrics, complete: false };
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

  return (
    (await scanPrettyMetricPhases<T>(buffer, wanted)) ??
    (await streamCollectMetricPhases<T>(buffer, wanted))
  );
}
