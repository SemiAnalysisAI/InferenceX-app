import type { IdRuns } from '@semianalysisai/inferencex-db/queries/benchmark-presence';

/**
 * `{[id]: true}` for each of `sortedIds` (ascending) inside `runs`, the
 * `?ids=` availability route response. One merge walk over both lists.
 */
export function presentIds(runs: IdRuns, sortedIds: number[]): Record<number, true> {
  const present: Record<number, true> = {};
  let i = 0;
  let end = 0;
  for (let r = 0; r < runs.length && i < sortedIds.length; r += 2) {
    const start = end + runs[r]!;
    end = start + runs[r + 1]!;
    while (i < sortedIds.length && sortedIds[i]! < start) i++;
    while (i < sortedIds.length && sortedIds[i]! < end) present[sortedIds[i++]!] = true;
  }
  return present;
}

/** Id set decoded once from runs into one bit per id, for constant-time lookups. */
export class IdBitset {
  readonly #bits: Uint8Array;

  constructor(runs: IdRuns) {
    let maxEnd = 0;
    for (let r = 0; r < runs.length; r += 2) maxEnd += runs[r]! + runs[r + 1]!;
    this.#bits = new Uint8Array((maxEnd >>> 3) + 1);
    let id = 0;
    for (let r = 0; r < runs.length; r += 2) {
      id += runs[r]!;
      for (const end = id + runs[r + 1]!; id < end; id++) this.#bits[id >>> 3]! |= 1 << (id & 7);
    }
  }

  /** `id` must be a persisted benchmark id (a positive integer). */
  has(id: number): boolean {
    return ((this.#bits[id >>> 3] ?? 0) & (1 << (id & 7))) !== 0;
  }
}
