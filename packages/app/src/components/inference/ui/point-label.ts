import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';

export function pointLabelText(point: InferenceData, advanced: boolean): string {
  return advanced ? `${getPointLabel(point)}\nC=${point.conc}` : `${point.tp}\nC=${point.conc}`;
}
