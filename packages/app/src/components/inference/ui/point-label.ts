import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';

export function pointLabelText(
  point: InferenceData,
  advanced: boolean,
  showConcurrency: boolean,
): string {
  const base = advanced ? getPointLabel(point) : `${point.physicalChips ?? point.tp}`;
  return showConcurrency ? `${base}\nC=${point.conc}` : base;
}
