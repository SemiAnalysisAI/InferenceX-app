import type {
  ComparisonCase,
  ComparisonOp,
  ComparisonView,
} from '@semianalysisai/inferencex-db/operatorx/compare';

import { escapeHtml } from '@/lib/utils';

/**
 * A slice is a set of cases that differ only in their size axis (GEMM M, MoE tokens):
 * same N×K and precision for GEMM, same layer for MoE. Size sweeps and per-shape
 * aggregates group by it.
 */
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

/** Size buckets for the primary axis. */
export const SIZE_BUCKETS: { label: string; max: number }[] = [
  { label: '1', max: 1 },
  { label: '2–16', max: 16 },
  { label: '17–128', max: 128 },
  { label: '129–1024', max: 1024 },
  { label: '1025–8192', max: 8192 },
  { label: '>8192', max: Infinity },
];

export function sizeBucket(x: number | null): string | null {
  if (x === null) return null;
  return SIZE_BUCKETS.find((b) => x <= b.max)?.label ?? null;
}

/** Slices, largest first. */
export function rankedSlices(op: ComparisonOp, cases: ComparisonCase[]): [string, number[]][] {
  return [...slices(op, cases)].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
}

/** Where case `i` comes from: its layers in the model and the models, each when known. */
export function caseOrigin(view: ComparisonView, i: number): { label: string; value: string }[] {
  const c = view.cases[i];
  const models = c.models.map((m) => view.models[m]);
  return [
    ...(c.role ? [{ label: c.role.includes(',') ? 'Layers' : 'Layer', value: c.role }] : []),
    ...(models.length > 0
      ? [{ label: models.length > 1 ? 'Models' : 'Model', value: models.join(', ') }]
      : []),
  ];
}

/** `caseOrigin` as tooltip rows. */
export function originRows(view: ComparisonView, i: number): string[] {
  return caseOrigin(view, i).map(
    (o) =>
      `<span class="text-muted-foreground">${escapeHtml(o.label)}</span> ${escapeHtml(o.value)}`,
  );
}
