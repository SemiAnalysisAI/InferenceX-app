import type { InferenceData } from '../types';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { getPrecisionLabel, type Precision } from '@/lib/catalog/data-mappings';
import { getDisplayLabel } from '@/lib/shared/utils';
import { isPositive } from '@/lib/power/power-basis';
import { observedPoints } from './equal-service-comparison';
import { powerBreakdownSeriesKey, type PowerBreakdownSeries } from './power-breakdown';

/**
 * Chips that have measured GPU power on screen but no whole-system breakdown,
 * so the compare bars can say why they are missing instead of silently
 * dropping them. Keyed the same way as the breakdown series (hardware + precision).
 */
export function chipsWithoutSystemModel(
  points: readonly InferenceData[],
  series: readonly Pick<PowerBreakdownSeries, 'key'>[],
): string[] {
  const covered = new Set(series.map((entry) => entry.key));
  const missing = new Map<string, string>();
  for (const point of observedPoints(points)) {
    if (!isPositive(point.measuredAvgPower?.y)) continue;
    const key = powerBreakdownSeriesKey(point);
    if (covered.has(key) || missing.has(key)) continue;
    missing.set(
      key,
      [
        getDisplayLabel(getHardwareConfig(point.hwKey, point.model)),
        getPrecisionLabel(point.precision as Precision),
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  return [...missing.values()].toSorted((a, b) => a.localeCompare(b));
}
