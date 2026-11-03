import { describe, expect, it } from 'vitest';

import { IdBitset, presentIds } from './benchmark-presence';

/** The `[gap, length, ...]` encoding `getBenchmarkPresence` builds from SQL runs. */
function encodeRuns(sortedIds: number[]): number[] {
  const runs: number[] = [];
  let end = 0;
  for (let i = 0; i < sortedIds.length;) {
    let j = i;
    while (j + 1 < sortedIds.length && sortedIds[j + 1] === sortedIds[j]! + 1) j++;
    runs.push(sortedIds[i]! - end, j - i + 1);
    end = sortedIds[j]! + 1;
    i = j + 1;
  }
  return runs;
}

/** Clustered ids like ingest assigns them, from a fixed-seed generator. */
function clusteredIds(seed: number, maxId: number): number[] {
  let state = seed;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const ids = new Set<number>();
  while (ids.size < maxId / 8) {
    const start = 1 + Math.floor(random() * maxId);
    const length = 1 + Math.floor(random() * 12);
    for (let id = start; id < Math.min(start + length, maxId + 1); id++) ids.add(id);
  }
  return [...ids].toSorted((a, b) => a - b);
}

describe('benchmark presence lookups', () => {
  it('agree with the id set for every id, at run edges and byte boundaries', () => {
    for (const seed of [1, 7, 42]) {
      const ids = clusteredIds(seed, 2_000);
      const present = new Set(ids);
      const runs = encodeRuns(ids);
      const bitset = new IdBitset(runs);
      const everyId = Array.from({ length: 2_100 }, (_, index) => index + 1);

      for (const id of everyId) expect(bitset.has(id), `id ${id}`).toBe(present.has(id));
      expect(presentIds(runs, everyId)).toEqual(
        Object.fromEntries(ids.map((id) => [id, true] as const)),
      );
      const sparseQuery = everyId.filter((id) => id % 3 === 0);
      expect(presentIds(runs, sparseQuery)).toEqual(
        Object.fromEntries(sparseQuery.filter((id) => present.has(id)).map((id) => [id, true])),
      );
    }
  });

  it('answers nothing for an empty set', () => {
    expect(new IdBitset([]).has(1)).toBe(false);
    expect(presentIds([], [1, 2, 3])).toEqual({});
  });
});
