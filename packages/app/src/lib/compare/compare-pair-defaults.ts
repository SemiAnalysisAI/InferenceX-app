import { rowToSequence } from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

// Picks the (sequence, precision) that maximises overlap of distinct
// (framework, spec_method, conc) variants between the two GPUs in a compare
// pair. Falls back to widest single-GPU coverage; nulls if neither has data.
export function pickPairDefaults(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  preferredSequence?: string,
): { sequence: string | null; precision: string | null } {
  const tally = new Map<string, { both: number; either: number }>();
  const seenA = new Map<string, Set<string>>();
  const seenB = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.hardware !== a && row.hardware !== b) continue;
    const seq = rowToSequence(row);
    if (!seq) continue;
    const key = `${seq}|${row.precision}`;
    const variantId = `${row.framework}|${row.spec_method}|${row.conc}`;
    if (row.hardware === a) {
      if (!seenA.has(key)) seenA.set(key, new Set());
      seenA.get(key)!.add(variantId);
    } else {
      if (!seenB.has(key)) seenB.set(key, new Set());
      seenB.get(key)!.add(variantId);
    }
  }
  for (const key of new Set([...seenA.keys(), ...seenB.keys()])) {
    const aSet = seenA.get(key) ?? new Set();
    const bSet = seenB.get(key) ?? new Set();
    let both = 0;
    for (const v of aSet) if (bSet.has(v)) both++;
    tally.set(key, { both, either: aSet.size + bSet.size });
  }
  if (tally.size === 0) return { sequence: null, precision: null };
  const best = [...tally.entries()].toSorted((left, right) => {
    if (preferredSequence) {
      const leftPreferred = left[0].startsWith(`${preferredSequence}|`);
      const rightPreferred = right[0].startsWith(`${preferredSequence}|`);
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    }
    if (left[1].both !== right[1].both) return right[1].both - left[1].both;
    return right[1].either - left[1].either;
  })[0];
  const [seq, prec] = best[0].split('|');
  if (!seq || !prec) return { sequence: null, precision: null };
  return { sequence: seq, precision: prec };
}
