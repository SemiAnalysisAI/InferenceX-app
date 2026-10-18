import type { LatestImageRow } from '@/lib/api/api';
import {
  baseFramework,
  daysSince,
  imageRowDisplayModel,
  imageRowSequence,
  isActiveImageRow,
} from './latest-image-utils';

export type ImageAgeObservation = Omit<LatestImageRow, 'image'>;

export interface ImageFilters {
  model: string;
  precision: string;
  sequence: string;
  spec: string;
  hardware: string;
  nodeType: 'all' | 'single' | 'disagg';
  frameworks: string[];
}

export interface ImageAgePoint {
  date: string;
  p90AgeDays: number | null;
  configurationCount: number;
}

export function matchesImageFilters(row: ImageAgeObservation, filters: ImageFilters): boolean {
  return (
    isActiveImageRow(row) &&
    (filters.model === 'all' || imageRowDisplayModel(row) === filters.model) &&
    (filters.precision === 'all' || row.precision === filters.precision) &&
    imageRowSequence(row) === filters.sequence &&
    (filters.spec === 'all' || row.spec_method === filters.spec) &&
    (filters.hardware === 'all' || row.hardware === filters.hardware) &&
    (filters.nodeType === 'all' || (filters.nodeType === 'disagg' ? row.disagg : !row.disagg)) &&
    (filters.frameworks.length === 0 || filters.frameworks.includes(baseFramework(row.framework)))
  );
}

function configurationKey(row: ImageAgeObservation): string {
  return JSON.stringify([
    row.model,
    row.hardware,
    row.framework,
    row.precision,
    row.spec_method,
    row.disagg,
    row.benchmark_type,
    row.isl,
    row.osl,
  ]);
}

/** Nearest-rank p90: one vote per displayed configuration, not per benchmark point. */
export function imageAgeSummary(rows: readonly ImageAgeObservation[], asOf: string): ImageAgePoint {
  const dates = new Map<string, string>();
  for (const row of rows) {
    if (row.date > asOf || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`))) continue;
    const key = configurationKey(row);
    if (!dates.has(key) || dates.get(key)! < row.date) dates.set(key, row.date);
  }
  const today = new Date(`${asOf}T00:00:00Z`);
  const ages = [...dates.values()].map((date) => daysSince(date, today)).sort((a, b) => a - b);
  return {
    date: asOf,
    p90AgeDays: ages.length > 0 ? ages[Math.ceil(ages.length * 0.9) - 1] : null,
    configurationCount: ages.length,
  };
}

/** Carry observations forward only; never backfill a configuration before its first submission. */
export function imageAgeHistory(
  observations: readonly ImageAgeObservation[],
  asOf: string,
): ImageAgePoint[] {
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const sorted = observations.toSorted((a, b) => a.date.localeCompare(b.date));
  const latest = new Map<string, ImageAgeObservation>();
  let cursor = 0;
  return Array.from({ length: 90 }, (_, index) => {
    const date = new Date(end - (89 - index) * 86_400_000).toISOString().slice(0, 10);
    while (cursor < sorted.length && sorted[cursor].date <= date) {
      const row = sorted[cursor++];
      latest.set(configurationKey(row), row);
    }
    return imageAgeSummary([...latest.values()], date);
  });
}
