import { updateRepoUrl } from '@/lib/shared/utils';
import { agenticDetailHref } from '@/lib/agentx/agentic-detail-link';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import type { Locale } from '@/lib/i18n/i18n';

import type { InferenceData } from '@/components/inference/types';
import { fmt, getPointLabel } from '@/components/inference/utils/tooltipUtils';

export interface LegendPointsTableRow {
  key: string;
  conc: number;
  parallelism: string;
  precision: string;
  offload: string | null;
  tputPerGpu: number | null;
  p50Intvty: number | null;
  p90Intvty: number | null;
  p50Ttft: number | null;
  p90Ttft: number | null;
  href: string | null;
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

const num = (v: number | undefined | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export function pointDetailHref(
  d: InferenceData,
  isOverlay: boolean,
  locale: Locale = 'en',
): { href: string | null; isExternal: boolean } {
  if (isOverlay) return { href: null, isExternal: false };
  if (d.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(d.id)) {
    return { href: agenticDetailHref(d.id, locale), isExternal: false };
  }
  if (d.run_url) return { href: updateRepoUrl(d.run_url), isExternal: true };
  return { href: null, isExternal: false };
}

export function buildLegendPointsRows(
  points: InferenceData[],
  isOverlay: boolean,
  locale: Locale = 'en',
): LegendPointsTableRow[] {
  return points
    .map((d, i) => {
      const { href, isExternal } = pointDetailHref(d, isOverlay, locale);
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

export const formatRowValue = (v: number | null): string => (v === null ? '—' : fmt(v));
