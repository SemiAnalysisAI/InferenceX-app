import type { IdRuns } from '@semianalysisai/inferencex-db/queries/benchmark-presence';

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

const CHUNK_IDS = 65_536;

export class IdBitset {
  readonly #chunks = new Map<number, Uint8Array>();

  constructor(runs: IdRuns) {
    let id = 0;
    let chunkIndex = -1;
    let bits: Uint8Array = new Uint8Array(0);
    for (let r = 0; r < runs.length; r += 2) {
      id += runs[r]!;
      for (const end = id + runs[r + 1]!; id < end; id++) {
        const index = Math.floor(id / CHUNK_IDS);
        if (index !== chunkIndex) {
          chunkIndex = index;
          bits = this.#chunks.get(index) ?? new Uint8Array(CHUNK_IDS / 8);
          this.#chunks.set(index, bits);
        }
        const offset = id - index * CHUNK_IDS;
        bits[offset >>> 3]! |= 1 << (offset & 7);
      }
    }
  }

  has(id: number): boolean {
    const index = Math.floor(id / CHUNK_IDS);
    const bits = this.#chunks.get(index);
    if (!bits) return false;
    const offset = id - index * CHUNK_IDS;
    return ((bits[offset >>> 3] ?? 0) & (1 << (offset & 7))) !== 0;
  }
}
