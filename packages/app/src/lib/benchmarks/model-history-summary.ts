import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';
import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants/models';

import type { AvailabilityRow } from '@/lib/api/api';

export interface ModelHistorySummary {
  /** Distinct benchmark dates. */
  snapshotDays: number;
  /** Calendar days from the first to the last benchmark date, inclusive; 0 without data. */
  spanDays: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Hardware vendors with benchmarks for the model, in registry order. */
  vendors: string[];
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const VENDOR_ORDER = [...new Set(Object.values(GPU_VENDORS))];

/** How much benchmark history each display model has, and on whose hardware. */
export function summarizeModelHistory(
  rows: readonly AvailabilityRow[],
  models: readonly string[],
): Map<string, ModelHistorySummary> {
  const byDbModel = new Map<string, { dates: Set<string>; vendors: Set<string> }>();
  for (const row of rows) {
    const entry = byDbModel.get(row.model) ?? { dates: new Set(), vendors: new Set() };
    entry.dates.add(row.date);
    const vendor = GPU_VENDORS[row.hardware.split('_')[0]];
    if (vendor) entry.vendors.add(vendor);
    byDbModel.set(row.model, entry);
  }
  return new Map(
    models.map((model) => {
      const dates = new Set<string>();
      const vendors = new Set<string>();
      for (const key of DISPLAY_MODEL_TO_DB[model] ?? [model]) {
        const entry = byDbModel.get(key);
        entry?.dates.forEach((date) => dates.add(date));
        entry?.vendors.forEach((vendor) => vendors.add(vendor));
      }
      const sorted = [...dates].toSorted();
      const firstDate = sorted[0] ?? null;
      const lastDate = sorted.at(-1) ?? null;
      return [
        model,
        {
          snapshotDays: dates.size,
          spanDays:
            firstDate && lastDate ? Math.round(dayNumber(lastDate) - dayNumber(firstDate)) + 1 : 0,
          firstDate,
          lastDate,
          vendors: VENDOR_ORDER.filter((vendor) => vendors.has(vendor)),
        },
      ];
    }),
  );
}
