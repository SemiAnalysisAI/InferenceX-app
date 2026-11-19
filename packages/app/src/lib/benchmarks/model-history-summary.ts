import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';
import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants/models';

import { datesOfLines, linesForModels, type AvailabilityIndex } from './availability-index';

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
  index: AvailabilityIndex,
  models: readonly string[],
): Map<string, ModelHistorySummary> {
  return new Map(
    models.map((model) => {
      const lines = linesForModels(index, DISPLAY_MODEL_TO_DB[model] ?? [model]);
      const dates = datesOfLines(index, lines).toSorted();
      const vendors = new Set(lines.map((line) => GPU_VENDORS[line.hardware.split('_')[0]]));
      const firstDate = dates[0] ?? null;
      const lastDate = dates.at(-1) ?? null;
      return [
        model,
        {
          snapshotDays: dates.length,
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
