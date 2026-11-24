import { rowToSequence } from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { buildGpuDataPointsForSequence } from '@/lib/compare/compare-ssr';
import { sharedInteractivityRange } from '@/lib/compare/compare-table-view';

/**
 * The (sequence, precision) a compare page opens on. Combinations where both chips have
 * measured points over a shared interactivity span come first, so the default targets land
 * where both chips have data. Within each group the preferred sequence leads, then the
 * combination with the most variants run on both chips. A `requiredSequence` limits the
 * choice to that sequence's precisions when it has any rows.
 */
export function pickPairDefaults(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  preferredSequence?: string,
  requiredSequence?: string,
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

  const candidates = [...tally.entries()].map(([key, counts]) => {
    const [seq = '', prec = ''] = key.split('|');
    return { seq, prec, counts };
  });
  const required = candidates.filter((c) => c.seq === requiredSequence);
  const pool = required.length > 0 ? required : candidates;
  const shared = new Map(
    pool.map((c) => [
      c,
      sharedInteractivityRange(
        buildGpuDataPointsForSequence(rows, a, c.seq, c.prec),
        buildGpuDataPointsForSequence(rows, b, c.seq, c.prec),
      ) !== null,
    ]),
  );
  const best = pool.toSorted((left, right) => {
    if (shared.get(left) !== shared.get(right)) return shared.get(left) ? -1 : 1;
    if (preferredSequence) {
      const leftPreferred = left.seq === preferredSequence;
      const rightPreferred = right.seq === preferredSequence;
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    }
    if (left.counts.both !== right.counts.both) return right.counts.both - left.counts.both;
    return right.counts.either - left.counts.either;
  })[0];
  if (!best?.seq || !best.prec) return { sequence: null, precision: null };
  return { sequence: best.seq, precision: best.prec };
}
