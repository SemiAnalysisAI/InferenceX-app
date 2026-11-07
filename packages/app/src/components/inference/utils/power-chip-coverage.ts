import type { AggDataEntry, InferenceData, PowerCompare } from '../types';
import { getMeasuredMetricConfig } from '../measured-metric-config';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { getPrecisionLabel, type Precision } from '@/lib/catalog/data-mappings';
import { getDisplayLabel } from '@/lib/shared/utils';
import { isPositive, type PowerBasis } from '@/lib/power/power-basis';
import { getRolePoints, observedPoints } from './equal-service-comparison';
import {
  allInMeasuredUnavailableReason,
  type AllInUnavailableReason,
} from './inference-table-data';
import { powerBreakdownSeriesKey, type PowerBreakdownSeries } from './power-breakdown';
import { powerCompareVariants } from './power-compare';

const chipLabel = (point: InferenceData): string =>
  [
    getDisplayLabel(getHardwareConfig(point.hwKey, point.model)),
    getPrecisionLabel(point.precision as Precision),
  ]
    .filter(Boolean)
    .join(' ');

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
    missing.set(key, chipLabel(point));
  }
  return [...missing.values()].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Whether any visible disaggregated point carries validated prefill or decode
 * telemetry on this axis. Disaggregated results alone are not enough: a model
 * can have them with no role-level power, which would open an empty panel.
 */
export function hasRoleTelemetry(
  points: readonly InferenceData[],
  xField: keyof AggDataEntry,
): boolean {
  return getRolePoints(points, xField).some(
    (role) =>
      role.prefillWattsPerGpu !== null ||
      role.decodeWattsPerGpu !== null ||
      role.prefillJoulesPerInputToken !== null ||
      role.decodeJoulesPerOutputToken !== null ||
      role.energy !== null,
  );
}

const isModeled = (basis: PowerBasis) => basis === 'it-modeled' || basis === 'utility-modeled';

/** The modeled IT and facility series the chart draws: its own metric and any Count: All lines. */
export function modeledPowerSeries(
  metric: string,
  compare: PowerCompare,
): { basis: PowerBasis; field: string }[] {
  const basis = getMeasuredMetricConfig(metric)?.basis;
  const own = basis && isModeled(basis) ? [{ basis, field: metric.slice(2) }] : [];
  const lines = powerCompareVariants(metric, compare).flatMap(({ variant, field }) =>
    variant.kind === 'basis' && isModeled(variant.id) ? [{ basis: variant.id, field }] : [],
  );
  return [...own, ...lines];
}

interface UnplottedPowerChip {
  label: string;
  points: number;
  /** Set on unofficial-run lines so the note can use the run's legend color. */
  overlayRunIndex?: number;
}

export interface UnplottedPowerReason {
  reason: AllInUnavailableReason;
  points: number;
  chips: UnplottedPowerChip[];
}

/**
 * Points with measured GPU power that have no value on a modeled series the chart draws,
 * grouped by why. No unavailable reason yields a modeled watt figure, so these points have
 * no honest position on an IT or facility axis: the chart names them instead of drawing them.
 */
export function unplottedModeledPower(
  official: readonly InferenceData[],
  overlay: readonly InferenceData[],
  fields: readonly string[],
  runIndex: (point: InferenceData) => number,
): UnplottedPowerReason[] {
  const groups = new Map<AllInUnavailableReason, Map<string, UnplottedPowerChip>>();
  const add = (point: InferenceData, run: number | undefined) => {
    if (point.powerVariant || !isPositive(point.measuredAvgPower?.y)) return;
    const reason = fields
      .map((field) => allInMeasuredUnavailableReason(point, field))
      .find((r) => r !== null);
    if (!reason) return;
    const chips = groups.get(reason) ?? new Map<string, UnplottedPowerChip>();
    groups.set(reason, chips);
    const key = `${powerBreakdownSeriesKey(point)}|${run ?? ''}`;
    const chip = chips.get(key) ?? { label: chipLabel(point), points: 0, overlayRunIndex: run };
    chip.points++;
    chips.set(key, chip);
  };
  for (const point of official) add(point, undefined);
  for (const point of overlay) add(point, runIndex(point));
  return [...groups].map(([reason, chips]) => {
    const list = [...chips.values()];
    return { reason, points: list.reduce((sum, chip) => sum + chip.points, 0), chips: list };
  });
}
