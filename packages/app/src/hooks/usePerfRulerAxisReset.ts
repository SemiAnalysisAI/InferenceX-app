import { useState, type Dispatch, type SetStateAction } from 'react';

import { clearPerfRulers, type PerfRulerState } from '@/lib/d3-chart/layers/perf-ruler';

/**
 * Clear every perf ruler (and any in-progress draft) when the chart's axis
 * metrics change.
 *
 * A ruler measures the multiple between two curves at one iso-x, in the
 * units of the axes it was placed on. Swapping the y-axis metric (e.g. from
 * total tokens per dollar to throughput per GPU) or the x-axis metric (e.g.
 * from P90 end-to-end latency to TTFT, or between percentiles) redraws
 * every curve with unrelated geometry, so a surviving ruler would report a
 * ratio the user never asked for at an x that now means something else.
 * Rulers do survive zoom, legend toggles, and date changes — those keep
 * the axis units intact.
 *
 * `axisMetricKey` is the caller's identity for the current axis pair. The
 * reset runs as render-time derived state (the "adjusting state when a prop
 * changes" pattern) rather than in an effect, so the D3 draw pass that
 * follows the metric change already sees the cleared state: no frame ever
 * paints stale rulers over the new curves. The initial key never triggers
 * a reset, so rulers restored on mount are left alone.
 */
export function usePerfRulerAxisReset(
  axisMetricKey: string,
  setPerfRulerState: Dispatch<SetStateAction<PerfRulerState>>,
): void {
  const [appliedAxisMetricKey, setAppliedAxisMetricKey] = useState(axisMetricKey);
  if (appliedAxisMetricKey !== axisMetricKey) {
    setAppliedAxisMetricKey(axisMetricKey);
    // `clearPerfRulers` returns the same reference when nothing is placed,
    // so an axis change with no rulers does not schedule a wasted update.
    setPerfRulerState(clearPerfRulers);
  }
}

/** Build the axis identity consumed by {@link usePerfRulerAxisReset}. */
export function perfRulerAxisMetricKey(xAxisField: string, yAxisMetric: string): string {
  return `${xAxisField}\u0000${yAxisMetric}`;
}
