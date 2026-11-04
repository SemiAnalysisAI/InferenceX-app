import { deflateSync, inflateSync } from 'node:zlib';

import {
  TOKEN_LENGTH_BINS_PER_OCTAVE,
  TOKEN_LENGTH_SKETCH_VERSION,
  type TokenLengthSketch,
} from '@semianalysisai/inferencex-constants';

export const SEQUENCE_LENGTH_SKETCH_FORMAT = 1;

const MAX_BIN_END = 64 * TOKEN_LENGTH_BINS_PER_OCTAVE;
const MAX_COUNT = 2 ** 32;

const SLOTS = [0, 1] as const;

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isEncodableSketch(value: object): value is TokenLengthSketch {
  if (
    !(
      'version' in value &&
      'binsPerOctave' in value &&
      'n' in value &&
      'zeroCount' in value &&
      'minBin' in value &&
      'counts' in value
    )
  ) {
    return false;
  }
  const { version, binsPerOctave, n, zeroCount, minBin, counts } = value;
  if (
    version !== TOKEN_LENGTH_SKETCH_VERSION ||
    binsPerOctave !== TOKEN_LENGTH_BINS_PER_OCTAVE ||
    !isIntegerIn(n, 1, MAX_COUNT) ||
    !isIntegerIn(zeroCount, 0, MAX_COUNT) ||
    !Array.isArray(counts) ||
    !isIntegerIn(minBin, 0, MAX_BIN_END - counts.length)
  ) {
    return false;
  }
  for (const count of counts) {
    if (!isIntegerIn(count, 0, MAX_COUNT)) return false;
  }
  return true;
}

function pushVarint(bytes: number[], value: number): void {
  let rest = value;
  while (rest >= 128) {
    bytes.push((rest % 128) | 128);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
}

export function encodeSequenceLengthSketches(sequenceLengths: unknown): Buffer | null {
  let pair: { isl?: unknown; osl?: unknown } = {};
  if (sequenceLengths !== null && sequenceLengths !== undefined) {
    if (typeof sequenceLengths !== 'object' || Array.isArray(sequenceLengths)) return null;
    pair = sequenceLengths;
  }
  const sketches: TokenLengthSketch[] = [];
  let presence = 0;
  for (const [bit, sketch] of [
    [1, pair.isl],
    [2, pair.osl],
  ] as const) {
    if (!sketch) continue;
    if (typeof sketch !== 'object' || !isEncodableSketch(sketch)) return null;
    presence |= bit;
    sketches.push(sketch);
  }

  const bytes = [presence];
  for (const { n, zeroCount, minBin, counts } of sketches) {
    pushVarint(bytes, n);
    pushVarint(bytes, zeroCount);
    pushVarint(bytes, minBin);
    pushVarint(bytes, counts.length);
  }
  for (const { counts } of sketches) {
    let index = 0;
    while (index < counts.length) {
      const zerosFrom = index;
      while (index < counts.length && counts[index] === 0) index += 1;
      pushVarint(bytes, index - zerosFrom);
      const runFrom = index;
      while (index < counts.length && counts[index] !== 0) index += 1;
      pushVarint(bytes, index - runFrom);
      for (let bin = runFrom; bin < index; bin += 1) pushVarint(bytes, counts[bin] - 1);
    }
  }
  return deflateSync(Buffer.from(bytes), { level: 9 });
}

function malformed(): Error {
  return new Error('sequence length sketches are malformed');
}

class VarintReader {
  at = 0;

  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  next(): number {
    let value = 0;
    let scale = 1;
    for (let read = 0; read < 5 && this.at < this.bytes.length; read += 1) {
      const byte = this.bytes[this.at++];
      value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
    throw malformed();
  }

  runs(binCount: number, into: Float64Array, offset: number, sign: number): void {
    let bin = 0;
    while (bin < binCount) {
      const zeros = this.next();
      const nonzero = this.next();
      if (zeros + nonzero === 0) throw malformed();
      bin += zeros;
      const end = bin + nonzero;
      if (end > binCount) throw malformed();
      for (; bin < end; bin += 1) into[offset + bin] += sign * (this.next() + 1);
    }
  }
}

interface MergeSide {
  counts: Float64Array;
  n: number;
  zeroCount: number;
  minBin: number;
  binEnd: number;
}

const HEADER_FIELDS = 4;

function walkPayload(
  bytes: Uint8Array,
  sides: readonly MergeSide[],
  header: Float64Array,
  sign: number,
): number {
  const reader = new VarintReader(bytes);
  const presence = reader.next();
  if (presence > 3) throw malformed();
  for (const slot of SLOTS) {
    if ((presence & (1 << slot)) === 0) continue;
    const at = slot * HEADER_FIELDS;
    for (let field = 0; field < HEADER_FIELDS; field += 1) header[at + field] = reader.next();
    if (header[at] === 0 || header[at + 2] + header[at + 3] > MAX_BIN_END) throw malformed();
  }
  for (const slot of SLOTS) {
    if ((presence & (1 << slot)) === 0) continue;
    const at = slot * HEADER_FIELDS;
    reader.runs(header[at + 3], sides[slot].counts, header[at + 2], sign);
  }
  if (reader.at !== bytes.length) throw malformed();
  return presence;
}

function mergedSketch({
  counts,
  n,
  zeroCount,
  minBin,
  binEnd,
}: MergeSide): TokenLengthSketch | null {
  if (n === 0) return null;
  const start = binEnd === 0 ? 0 : minBin;
  return {
    version: TOKEN_LENGTH_SKETCH_VERSION,
    binsPerOctave: TOKEN_LENGTH_BINS_PER_OCTAVE,
    n,
    zeroCount,
    minBin: start,
    counts: [...counts.subarray(start, binEnd)],
  };
}

export interface MergedSequenceLengthSketches {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
  coveredPoints: number;
  unreadable: number[];
}

export function mergeSequenceLengthSketchPayloads(
  payloads: readonly Uint8Array[],
): MergedSequenceLengthSketches {
  const unreadable: number[] = [];
  if (payloads.length === 0) return { isl: null, osl: null, coveredPoints: 0, unreadable };
  const sides = SLOTS.map((): MergeSide => ({
    counts: new Float64Array(MAX_BIN_END),
    n: 0,
    zeroCount: 0,
    minBin: MAX_BIN_END,
    binEnd: 0,
  }));
  const header = new Float64Array(SLOTS.length * HEADER_FIELDS);
  let coveredPoints = 0;
  for (let index = 0; index < payloads.length; index += 1) {
    let bytes: Uint8Array;
    let presence: number;
    try {
      bytes = inflateSync(payloads[index]);
    } catch {
      unreadable.push(index);
      continue;
    }
    try {
      presence = walkPayload(bytes, sides, header, 1);
    } catch {
      try {
        walkPayload(bytes, sides, header, -1);
      } catch {}
      unreadable.push(index);
      continue;
    }
    if (presence !== 0) coveredPoints += 1;
    for (const slot of SLOTS) {
      if ((presence & (1 << slot)) === 0) continue;
      const side = sides[slot];
      const at = slot * HEADER_FIELDS;
      side.n += header[at];
      side.zeroCount += header[at + 1];
      if (header[at + 3] === 0) continue;
      side.minBin = Math.min(side.minBin, header[at + 2]);
      side.binEnd = Math.max(side.binEnd, header[at + 2] + header[at + 3]);
    }
  }
  return {
    isl: mergedSketch(sides[0]),
    osl: mergedSketch(sides[1]),
    coveredPoints,
    unreadable,
  };
}
