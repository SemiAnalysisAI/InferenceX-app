import { useState, type Dispatch, type SetStateAction } from 'react';

import { clearPerfRulers, type PerfRulerState } from '@/lib/d3-chart/layers/perf-ruler';

export function usePerfRulerAxisReset(
  axisMetricKey: string,
  setPerfRulerState: Dispatch<SetStateAction<PerfRulerState>>,
): void {
  const [appliedAxisMetricKey, setAppliedAxisMetricKey] = useState(axisMetricKey);
  if (appliedAxisMetricKey !== axisMetricKey) {
    setAppliedAxisMetricKey(axisMetricKey);
    setPerfRulerState(clearPerfRulers);
  }
}

export function perfRulerAxisMetricKey(xAxisField: string, yAxisMetric: string): string {
  return `${xAxisField}\u0000${yAxisMetric}`;
}
