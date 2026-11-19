import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  buildTokenLengthSketch,
  mergeTokenLengthSketches,
  TOKEN_LENGTH_BINS_PER_OCTAVE,
  TOKEN_LENGTH_SKETCH_VERSION,
  type TokenLengthSketch,
} from '@semianalysisai/inferencex-constants';

import {
  encodeSequenceLengthSketches,
  mergeSequenceLengthSketchPayloads,
} from './sequence-length-sketch-codec';

interface Pair {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
}

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function samples(next: () => number): number[] {
  const count = Math.floor(next() * 600);
  const centre = 2 ** (next() * 20);
  return Array.from({ length: count }, () => {
    const roll = next();
    if (roll < 0.05) return 0;
    if (roll < 0.3) return Math.round(centre);
    return Math.round(centre * (0.5 + next() * 3));
  });
}

function sketch(minBin: number, counts: number[], zeroCount = 0): TokenLengthSketch {
  return {
    version: TOKEN_LENGTH_SKETCH_VERSION,
    binsPerOctave: TOKEN_LENGTH_BINS_PER_OCTAVE,
    n: zeroCount + counts.reduce((sum, count) => sum + count, 0),
    zeroCount,
    minBin,
    counts,
  };
}

function reference(pairs: readonly Pair[]) {
  return {
    isl: mergeTokenLengthSketches(pairs.map((pair) => pair.isl)),
    osl: mergeTokenLengthSketches(pairs.map((pair) => pair.osl)),
    coveredPoints: pairs.filter((pair) => pair.isl || pair.osl).length,
  };
}

function merged(pairs: readonly Pair[]) {
  const { isl, osl, coveredPoints, unreadable } = mergeSequenceLengthSketchPayloads(
    pairs.map((pair) => encodeSequenceLengthSketches(pair)!),
  );
  expect(unreadable).toEqual([]);
  return { isl, osl, coveredPoints };
}

describe('sequence length sketch payloads', () => {
  it('merge to the same JSON as mergeTokenLengthSketches over the stored sketches', () => {
    const next = random(26);
    for (let round = 0; round < 40; round += 1) {
      const pairs = Array.from({ length: 1 + Math.floor(next() * 12) }, (): Pair => {
        const roll = next();
        return {
          isl: roll < 0.15 ? null : buildTokenLengthSketch(samples(next)),
          osl: roll > 0.85 ? null : buildTokenLengthSketch(samples(next)),
        };
      });
      expect(JSON.stringify(merged(pairs))).toBe(JSON.stringify(reference(pairs)));
    }
  });

  it('keeps zero-only sketches and leading or trailing zero bins in the merged range', () => {
    const pairs: Pair[] = [
      { isl: buildTokenLengthSketch([0, 0, 0]), osl: null },
      { isl: sketch(3_000, [0, 0, 4, 0, 300]), osl: sketch(10, [7, 0, 0]) },
      { isl: sketch(3_010, [1], 2), osl: sketch(2, [0, 1]) },
      { isl: null, osl: null },
    ];
    expect(JSON.stringify(merged(pairs))).toBe(JSON.stringify(reference(pairs)));
    expect(merged(pairs.slice(0, 1))).toEqual({
      isl: sketch(0, [], 3),
      osl: null,
      coveredPoints: 1,
    });
  });

  it('treat falsy sketches as absent and cover nothing without a sketch', () => {
    for (const value of [null, undefined, {}, { isl: null, osl: 0 }, { isl: false, osl: '' }]) {
      const payload = encodeSequenceLengthSketches(value);
      expect(payload).not.toBeNull();
      expect(mergeSequenceLengthSketchPayloads([payload!])).toEqual({
        isl: null,
        osl: null,
        coveredPoints: 0,
        unreadable: [],
      });
    }
  });

  it('are not written for sketches the JSON merge would treat differently', () => {
    const valid = sketch(500, [1, 2]);
    for (const value of [
      [valid],
      'sketches',
      { isl: 5 },
      { isl: [valid] },
      { isl: { ...valid, version: TOKEN_LENGTH_SKETCH_VERSION + 1 } },
      { isl: { ...valid, binsPerOctave: TOKEN_LENGTH_BINS_PER_OCTAVE / 2 } },
      { osl: { ...valid, n: 0 } },
      { osl: { ...valid, n: 2.5 } },
      { osl: { ...valid, zeroCount: undefined } },
      { osl: { ...valid, minBin: -1 } },
      { osl: { ...valid, counts: [1, null] } },
      { osl: { ...valid, counts: [1, -1] } },
      { osl: { ...valid, counts: [1, 0.5] } },
      { osl: { ...valid, counts: [2 ** 33] } },
    ]) {
      expect(encodeSequenceLengthSketches(value)).toBeNull();
    }
  });

  it('report corrupt payloads without letting them add to the merge', () => {
    const good: Pair = { isl: sketch(400, [3, 0, 1]), osl: sketch(90, [2]) };
    const payload = encodeSequenceLengthSketches(good)!;
    const truncatedRuns = deflateSync(Buffer.from([1, 4, 0, 144, 3, 3, 0, 3, 2]));
    const trailingByte = deflateSync(Buffer.from([0, 0]));
    const binPastEnd = deflateSync(Buffer.from([1, 1, 0, 128, 128, 1, 1, 0, 1, 0]));
    const result = mergeSequenceLengthSketchPayloads([
      payload,
      payload.subarray(0, -2),
      truncatedRuns,
      Buffer.from('not zlib'),
      trailingByte,
      binPastEnd,
    ]);
    expect(result).toEqual({ ...reference([good]), unreadable: [1, 2, 3, 4, 5] });
  });
});
