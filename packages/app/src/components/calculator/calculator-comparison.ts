import type { HardwareConfig } from '@/components/inference/types';
import { getHardwareConfig } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';

import { getThroughputForType, getTpPerMwForType } from './throughput-bar-chart-utils';
import type { BarMetric, CostType, InterpolatedResult } from './types';

/** Human label for a result row: GPU display name + precision suffix. */
export function getResultLabel(r: InterpolatedResult, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[r.hwKey] || getHardwareConfig(r.hwKey);
  const baseName = config ? getDisplayLabel(config) : r.hwKey;
  return r.precision ? `${baseName} (${r.precision.toUpperCase()})` : baseName;
}

function metricValue(r: InterpolatedResult, barMetric: BarMetric, costType: CostType): number {
  if (barMetric === 'power') return getTpPerMwForType(r, costType);
  if (barMetric === 'cost') {
    return costType === 'input' ? r.costInput : costType === 'output' ? r.costOutput : r.cost;
  }
  return getThroughputForType(r, costType);
}

/**
 * Builds the pairwise "X is N× more <metric> than Y" comparison strings shown
 * in the selection banner. Returns null when fewer than two selected results
 * are available. Extracted verbatim from ThroughputCalculatorDisplay.
 */
export function buildComparisonText(
  selectedBars: Set<string>,
  results: InterpolatedResult[],
  hardwareConfig: HardwareConfig,
  barMetric: BarMetric,
  costType: CostType,
): string[] | null {
  if (selectedBars.size < 2) return null;

  const selectedResults = results.filter((r) => selectedBars.has(r.resultKey));
  if (selectedResults.length < 2) return null;

  const metricName =
    barMetric === 'power' ? 'tok/s/MW' : barMetric === 'cost' ? 'cost efficiency' : 'throughput';

  // Generate pairwise comparisons — always use lower as denominator
  const comparisons: string[] = [];
  for (let i = 0; i < selectedResults.length; i++) {
    for (let j = i + 1; j < selectedResults.length; j++) {
      const a = selectedResults[i];
      const b = selectedResults[j];
      const aVal = metricValue(a, barMetric, costType);
      const bVal = metricValue(b, barMetric, costType);

      const higher = aVal >= bVal ? a : b;
      const lower = aVal >= bVal ? b : a;
      const higherVal = Math.max(aVal, bVal);
      const lowerVal = Math.min(aVal, bVal);

      if (lowerVal > 0) {
        const ratio = higherVal / lowerVal;
        comparisons.push(
          `${getResultLabel(higher, hardwareConfig)} is ${ratio.toFixed(1)}x more ${metricName} than ${getResultLabel(lower, hardwareConfig)}`,
        );
      }
    }
  }

  return comparisons;
}
