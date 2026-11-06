import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';

import type { StoredGpuMetricSample } from './gpu-metric-stats';

export const GPU_SAMPLE_BLOB_FORMAT_VERSION = 1;

const METRIC_COLUMNS = [
  'power_w',
  'temperature_c',
  'sm_clock_mhz',
  'mem_clock_mhz',
  'gpu_util_pct',
  'mem_util_pct',
  'edge_temp_c',
  'mem_temp_c',
  'gfx_voltage_mv',
  'soc_voltage_mv',
  'mem_voltage_mv',
  'fclk_mhz',
  'socclk_mhz',
  'mm_activity_pct',
] as const satisfies readonly Exclude<keyof StoredGpuMetricSample, 'gpu_index' | 'sampled_at'>[];

export class GpuSampleBlobUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpuSampleBlobUnsupportedError';
  }
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const FLOAT4_FRACTION_BITS = 2 ** 23 - 1;
const BYTE = 255;

function float4Bits(value: number): number {
  f32[0] = value;
  return u32[0]!;
}

function float4FromBits(bits: number): number {
  u32[0] = bits;
  return f32[0]!;
}

function isFloat4Midpoint(parsed: number, rounded: number): boolean {
  if (!Number.isFinite(rounded)) return false;
  const bits = float4Bits(rounded);
  const other = float4FromBits(Math.abs(parsed) > Math.abs(rounded) ? bits + 1 : bits - 1);
  return parsed === (rounded + other) / 2;
}

/* oxlint-disable unicorn/prefer-bigint-literals */
const BIG_1 = BigInt(1);
const BIG_2 = BigInt(2);
const BIG_4 = BigInt(4);
const BIG_10 = BigInt(10);
/* oxlint-enable unicorn/prefer-bigint-literals */

export function shortestFloat4Exact(value: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const bits = float4Bits(value);
  const exponentField = (bits >>> 23) & BYTE;
  const fraction = bits & FLOAT4_FRACTION_BITS;
  const mantissa = exponentField === 0 ? fraction : fraction + 2 ** 23;
  const e2 = (exponentField === 0 ? 1 : exponentField) - 127 - 23 - 2;
  const mv = BIG_4 * BigInt(mantissa);
  const mp = mv + BIG_2;
  const mm = mv - (fraction !== 0 || exponentField <= 1 ? BIG_2 : BIG_1);
  const magnitude = Math.abs(value);
  for (let k = Math.floor(Math.log10(magnitude)) + 2; ; k--) {
    const num = (e2 > 0 ? BIG_2 ** BigInt(e2) : BIG_1) * (k < 0 ? BIG_10 ** BigInt(-k) : BIG_1);
    const den = (e2 < 0 ? BIG_2 ** BigInt(-e2) : BIG_1) * (k > 0 ? BIG_10 ** BigInt(k) : BIG_1);
    const low = (mm * num) / den + BIG_1;
    const high = (mp * num - BIG_1) / den;
    if (low > high) continue;
    const targetNum = mv * num;
    let nearest = targetNum / den;
    const twiceRemainder = BIG_2 * (targetNum % den);
    if (twiceRemainder > den || (twiceRemainder === den && nearest % BIG_2 === BIG_1))
      nearest += BIG_1;
    if (nearest < low) nearest = low;
    if (nearest > high) nearest = high;
    const digits = `${nearest}e${k}`;
    return Number(value < 0 ? `-${digits}` : digits);
  }
}

export function pgFloat4Number(value: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const bits = float4Bits(value);
  const exponentField = (bits >>> 23) & BYTE;
  if ((bits & FLOAT4_FRACTION_BITS) === 0 && exponentField > 1) return shortestFloat4Exact(value);
  for (let digits = 1; digits <= 9; digits++) {
    const parsed = Number(value.toPrecision(digits));
    const rounded = Math.fround(parsed);
    if (rounded !== parsed && isFloat4Midpoint(parsed, rounded)) break;
    if (rounded !== value) continue;
    const longer = value.toPrecision(digits + 1);
    if (Number(longer) === value && /5(?:e|$)/u.test(longer)) break;
    return parsed;
  }
  return shortestFloat4Exact(value);
}

const secondsPrefix = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().slice(0, 19);

function parseSecondsPrefix(prefix: string): number {
  const ms = Date.parse(`${prefix}Z`);
  if (!Number.isFinite(ms) || ms % 1000 !== 0 || secondsPrefix(ms / 1000) !== prefix) {
    throw new GpuSampleBlobUnsupportedError(`sampled_at ${prefix} has no exact epoch second`);
  }
  return ms / 1000;
}

const MICRO_DIGITS = /^\d{6}$/u;

function writePlanes(
  out: Uint8Array,
  offset: number,
  values: ArrayLike<number>,
  count: number,
  bytes: number,
): number {
  for (let plane = 0; plane < bytes; plane++) {
    const shift = plane * 8;
    const start = offset + plane * count;
    for (let i = 0; i < count; i++) out[start + i] = (values[i]! >>> shift) & BYTE;
  }
  return offset + bytes * count;
}

function readPlanes(input: Uint8Array, offset: number, count: number, bytes: number): Uint32Array {
  const values = new Uint32Array(count);
  for (let plane = 0; plane < bytes; plane++) {
    const shift = plane * 8;
    const start = offset + plane * count;
    for (let i = 0; i < count; i++) values[i]! |= input[start + i]! << shift;
  }
  return values;
}

function checkedCell(row: StoredGpuMetricSample, column: string): number | null {
  const value: unknown = (row as Record<string, unknown>)[column];
  if (value === null || typeof value === 'number') return value;
  throw new GpuSampleBlobUnsupportedError(`${column} holds ${typeof value}, not a float4 number`);
}

export function encodeGpuSampleBlob(rows: readonly StoredGpuMetricSample[]): Buffer {
  const count = rows.length;
  const gpuIndex = new Uint32Array(count);
  const secondDeltas = new Uint32Array(count);
  const micros = new Uint32Array(count);
  let baseSeconds = 0;
  let previousSeconds = 0;
  let prefix = '';
  let prefixSeconds = 0;
  for (let i = 0; i < count; i++) {
    const row = rows[i]!;
    const index = row.gpu_index;
    if (!Number.isInteger(index) || index < -32_768 || index > 32_767 || Object.is(index, -0)) {
      throw new GpuSampleBlobUnsupportedError(`gpu_index ${String(index)} is not a smallint`);
    }
    gpuIndex[i] = index & 65_535;
    const sampledAt = row.sampled_at;
    if (
      typeof sampledAt !== 'string' ||
      sampledAt.length !== 27 ||
      sampledAt[19] !== '.' ||
      sampledAt[26] !== 'Z' ||
      !MICRO_DIGITS.test(sampledAt.slice(20, 26))
    ) {
      throw new GpuSampleBlobUnsupportedError(
        `sampled_at ${String(sampledAt)} is not to_char text`,
      );
    }
    const rowPrefix = sampledAt.slice(0, 19);
    if (rowPrefix !== prefix) {
      prefixSeconds = parseSecondsPrefix(rowPrefix);
      prefix = rowPrefix;
    }
    if (i === 0) {
      baseSeconds = prefixSeconds;
      previousSeconds = prefixSeconds;
    }
    const delta = prefixSeconds - previousSeconds;
    if (delta < -(2 ** 31) || delta >= 2 ** 31) {
      throw new GpuSampleBlobUnsupportedError(`sampled_at jumps ${delta}s between rows`);
    }
    secondDeltas[i] = delta >>> 0;
    previousSeconds = prefixSeconds;
    micros[i] = Number(sampledAt.slice(20, 26));
  }

  const bitmapBytes = Math.ceil(count / 8);
  const exact = new Set<number>();
  const metrics = METRIC_COLUMNS.map((column) => {
    const bitmap = new Uint8Array(bitmapBytes);
    const bits = new Uint32Array(count);
    let present = 0;
    for (let i = 0; i < count; i++) {
      const value = checkedCell(rows[i]!, column);
      if (value === null) continue;
      const float = Math.fround(value);
      const floatBits = float4Bits(float);
      if (value !== 0 && !exact.has(floatBits)) {
        if (!Object.is(pgFloat4Number(float), value)) {
          throw new GpuSampleBlobUnsupportedError(`${column} ${value} is not float4 output`);
        }
        exact.add(floatBits);
      }
      bitmap[i >>> 3]! |= 1 << (i & 7);
      bits[present++] = floatBits;
    }
    return { bitmap, bits, present };
  });

  const size =
    13 +
    count * (2 + 4 + 3) +
    metrics.reduce((total, metric) => total + bitmapBytes + metric.present * 4, 0);
  const raw = new Uint8Array(size);
  const view = new DataView(raw.buffer);
  view.setUint8(0, GPU_SAMPLE_BLOB_FORMAT_VERSION);
  view.setUint32(1, count, true);
  view.setFloat64(5, baseSeconds, true);
  let offset = 13;
  offset = writePlanes(raw, offset, gpuIndex, count, 2);
  offset = writePlanes(raw, offset, secondDeltas, count, 4);
  offset = writePlanes(raw, offset, micros, count, 3);
  for (const metric of metrics) {
    raw.set(metric.bitmap, offset);
    offset += bitmapBytes;
    offset = writePlanes(raw, offset, metric.bits, metric.present, 4);
  }
  return brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: size,
    },
  });
}

export function decodeGpuSampleBlob(data: Uint8Array): StoredGpuMetricSample[] {
  const raw = brotliDecompressSync(data);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw.byteLength < 13 || view.getUint8(0) !== GPU_SAMPLE_BLOB_FORMAT_VERSION) {
    throw new Error('gpu_metric_sample_blobs.data has an unknown layout');
  }
  const count = view.getUint32(1, true);
  const baseSeconds = view.getFloat64(5, true);
  const bitmapBytes = Math.ceil(count / 8);
  let offset = 13;
  const gpuIndex = readPlanes(raw, offset, count, 2);
  offset += 2 * count;
  const secondDeltas = new Int32Array(readPlanes(raw, offset, count, 4).buffer);
  offset += 4 * count;
  const micros = readPlanes(raw, offset, count, 3);
  offset += 3 * count;

  const numbers = new Map<number, number>();
  const columns = METRIC_COLUMNS.map(() => {
    const bitmap = raw.subarray(offset, offset + bitmapBytes);
    offset += bitmapBytes;
    let present = 0;
    for (const byte of bitmap) {
      for (let bit = byte; bit !== 0; bit &= bit - 1) present++;
    }
    const bits = readPlanes(raw, offset, present, 4);
    offset += 4 * present;
    const values: (number | null)[] = [];
    let next = 0;
    for (let i = 0; i < count; i++) {
      if ((bitmap[i >>> 3]! & (1 << (i & 7))) === 0) {
        values.push(null);
        continue;
      }
      const floatBits = bits[next++]!;
      let value = numbers.get(floatBits);
      if (value === undefined) {
        value = pgFloat4Number(float4FromBits(floatBits));
        numbers.set(floatBits, value);
      }
      values.push(value);
    }
    return values;
  });
  if (offset !== raw.byteLength) {
    throw new Error('gpu_metric_sample_blobs.data length does not match its row count');
  }

  const [power, temperature, smClock, memClock, gpuUtil, memUtil, edgeTemp, memTemp] = columns;
  const [gfxVoltage, socVoltage, memVoltage, fclk, socClk, mmActivity] = columns.slice(8);
  const rows: StoredGpuMetricSample[] = [];
  let seconds = baseSeconds;
  let prefixSeconds = Number.NaN;
  let prefix = '';
  for (let i = 0; i < count; i++) {
    seconds += secondDeltas[i]!;
    if (seconds !== prefixSeconds) {
      prefix = secondsPrefix(seconds);
      prefixSeconds = seconds;
    }
    rows.push({
      gpu_index: (gpuIndex[i]! << 16) >> 16,
      sampled_at: `${prefix}.${String(micros[i]!).padStart(6, '0')}Z`,
      power_w: power![i]!,
      temperature_c: temperature![i]!,
      sm_clock_mhz: smClock![i]!,
      mem_clock_mhz: memClock![i]!,
      gpu_util_pct: gpuUtil![i]!,
      mem_util_pct: memUtil![i]!,
      edge_temp_c: edgeTemp![i]!,
      mem_temp_c: memTemp![i]!,
      gfx_voltage_mv: gfxVoltage![i]!,
      soc_voltage_mv: socVoltage![i]!,
      mem_voltage_mv: memVoltage![i]!,
      fclk_mhz: fclk![i]!,
      socclk_mhz: socClk![i]!,
      mm_activity_pct: mmActivity![i]!,
    });
  }
  return rows;
}
