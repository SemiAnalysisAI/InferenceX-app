import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';

export function pointLabelText(
  point: InferenceData,
  advanced: boolean,
  showConcurrency: boolean,
): string {
  const base = advanced ? getPointLabel(point) : `${point.tp}`;
  // Concurrency is opt-in via the advanced "# Concurrent Sessions" toggle so
  // the default labels stay light-weight.
  return showConcurrency ? `${base}\nC=${point.conc}` : base;
}
