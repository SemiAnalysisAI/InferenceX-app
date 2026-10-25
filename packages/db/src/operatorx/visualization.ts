import type { ComparisonCase, ComparisonOp, ComparisonView, ComputePrecision } from './compare';

export function sliceKey(op: ComparisonOp, c: ComparisonCase): string {
  if (op === 'gemm') return `N=${c.dims.n} K=${c.dims.k} · ${c.precision}`;
  return `${c.shape.replace(/^T=\d+ /u, '')} · ${c.precision}`;
}

export function slices(op: ComparisonOp, cases: ComparisonCase[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  cases.forEach((c, i) => {
    const k = sliceKey(op, c);
    out.set(k, [...(out.get(k) ?? []), i]);
  });
  return out;
}

export function rankedSlices(op: ComparisonOp, cases: ComparisonCase[]): [string, number[]][] {
  return [...slices(op, cases)].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
}

export interface ComparisonDefaults {
  metricVsSizeSlice: string | null;
  rooflinePrecision: ComputePrecision | null;
  rooflineNormalized: boolean;
}

/** Resolve defaults from the selected workload without changing its measurements. */
export function comparisonDefaults(
  view: Pick<ComparisonView, 'op' | 'cases' | 'measurements'>,
): ComparisonDefaults {
  const groups = rankedSlices(view.op, view.cases).filter(([, indices]) => indices.length > 1);
  const ascend = view.measurements.ascend950pr;
  const preferred =
    ascend &&
    groups.find(([, indices]) => {
      const measuredSizes = new Set(
        indices.flatMap((i) => {
          const x = view.cases[i].x;
          const us = ascend.latencyUs[i];
          return ascend.status[i] === 'ok' &&
            us !== null &&
            Number.isFinite(us) &&
            us > 0 &&
            x !== null &&
            x > 0
            ? [x]
            : [];
        }),
      );
      return measuredSizes.size > 1;
    });
  const counts = new Map<ComputePrecision, number>();
  for (const c of view.cases) {
    if (c.flops && c.bytes && c.computePrecision !== 'other') {
      counts.set(c.computePrecision, (counts.get(c.computePrecision) ?? 0) + 1);
    }
  }
  const order: ComputePrecision[] = ['fp4', 'fp8', 'bf16'];
  const fallback = order
    .filter((p) => counts.has(p))
    .sort((a, b) => counts.get(b)! - counts.get(a)!)[0];
  return {
    metricVsSizeSlice: (preferred || groups[0])?.[0] ?? null,
    rooflinePrecision: counts.has('bf16') ? 'bf16' : (fallback ?? null),
    rooflineNormalized: true,
  };
}
