import type { InferenceData } from '@/components/inference/types';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';

export function pointLabelText(
  point: InferenceData,
  showGpuCount: boolean,
  advanced: boolean,
  showConcurrency: boolean,
): string {
  return [
    showGpuCount ? `${point.physicalChips ?? point.tp}` : '',
    advanced ? getPointLabel(point) : '',
    showConcurrency ? `C=${point.conc}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
