import { updateRepoUrl } from '@/lib/utils';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';

import type { InferenceData } from '@/components/inference/types';
import { fmt, getPointLabel } from '@/components/inference/utils/tooltipUtils';

/**
 * One row of the per-series points table opened from the chart legend.
 * Metric fields are `null` when the point predates the field (old runs) so the
 * table can render an em dash instead of a misleading 0.
 */
export interface LegendPointsTableRow {
  /** Stable React key — mirrors the scatter chart's per-point identity fields. */
  key: string;
  conc: number;
  /** Shared parallelism label (e.g. "TP8", "DPAEP8", "2xEP4+1xDPAEP32"). */
  parallelism: string;
  precision: string;
  /** Agentic offload mode ("ON" / "OFF"), null for fixed-seq points. */
  offload: string | null;
  tputPerGpu: number | null;
  p50Intvty: number | null;
  p90Intvty: number | null;
  p50Ttft: number | null;
  p90Ttft: number | null;
  /** Detail link — null for overlay points (no DB benchmark id). */
  href: string | null;
  /** True when href is an external GitHub Actions run (open in new tab). */
  isExternal: boolean;
}

export type LegendPointsSortKey =
  | 'conc'
  | 'parallelism'
  | 'offload'
  | 'tputPerGpu'
  | 'p50Intvty'
  | 'p90Intvty'
  | 'p50Ttft'
  | 'p90Ttft';

// benchmark-transform coerces absent metrics to 0 (`m.median_ttft ?? 0`), and
// every column metric here (throughput, interactivity, TTFT) is strictly
// positive in reality — so non-positive means "not recorded", shown as a dash.
const num = (v: number | undefined | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Detail-page destination for a point — the EXACT same navigation the scatter
 * tooltip offers on point click: agentic points go to the in-app
 * `/inference/agentic/<id>` detail page; fixed-seq points open the GitHub
 * Actions run that produced them. Overlay (unofficial run) points have no DB
 * benchmark id, so they get no link.
 */
export function pointDetailHref(
  d: InferenceData,
  isOverlay: boolean,
): { href: string | null; isExternal: boolean } {
  if (isOverlay) return { href: null, isExternal: false };
  if (d.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(d.id)) {
    return { href: `/inference/agentic/${d.id}`, isExternal: false };
  }
  if (d.run_url) return { href: updateRepoUrl(d.run_url), isExternal: true };
  return { href: null, isExternal: false };
}

/**
 * Shape a series' visible points into table rows, default-sorted by
 * concurrency ascending (offload/parallelism tie-breaks keep the agentic
 * on/off row pairs adjacent and deterministic).
 */
export function buildLegendPointsRows(
  points: InferenceData[],
  isOverlay: boolean,
): LegendPointsTableRow[] {
  return points
    .map((d, i) => {
      const { href, isExternal } = pointDetailHref(d, isOverlay);
      return {
        key: `${d.hwKey}|${d.precision}|${d.conc}|${getPointLabel(d)}|${d.offload_mode ?? ''}|${i}`,
        conc: d.conc,
        parallelism: getPointLabel(d),
        precision: d.precision,
        offload: d.offload_mode ? d.offload_mode.toUpperCase() : null,
        tputPerGpu: num(d.tput_per_gpu),
        p50Intvty: num(d.median_intvty),
        p90Intvty: num(d.p90_intvty),
        p50Ttft: num(d.median_ttft),
        p90Ttft: num(d.p90_ttft),
        href,
        isExternal,
      };
    })
    .toSorted(
      (a, b) =>
        a.conc - b.conc ||
        a.parallelism.localeCompare(b.parallelism) ||
        (a.offload ?? '').localeCompare(b.offload ?? ''),
    );
}

/** Column sort with nulls always last; concurrency as the stable tie-break. */
export function sortLegendPointsRows(
  rows: LegendPointsTableRow[],
  key: LegendPointsSortKey,
  dir: 'asc' | 'desc',
): LegendPointsTableRow[] {
  const mul = dir === 'asc' ? 1 : -1;
  return rows.toSorted((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return a.conc - b.conc;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : (av as number) - (bv as number);
    return mul * cmp || a.conc - b.conc;
  });
}

/** Table cell formatting — same capping as the scatter tooltip values. */
export const formatRowValue = (v: number | null): string => (v === null ? '—' : fmt(v));
