export type ScatterXAxisScale = 'linear' | 'log';
export type ScatterXAxisScalePreference = 'auto' | ScatterXAxisScale;

interface ResolveScatterXAxisScaleOptions {
  extent: readonly [number, number];
  selectedYAxisMetric: string;
  xAxisField: string;
  scaleType: ScatterXAxisScalePreference;
}

/**
 * Resolve the scatter plot's x scale from stable metric identities.
 * Display labels are deliberately excluded because they vary by locale.
 */
export function resolveScatterXAxisScale({
  extent,
  selectedYAxisMetric,
  xAxisField,
  scaleType,
}: ResolveScatterXAxisScaleOptions): ScatterXAxisScale {
  if (selectedYAxisMetric !== 'y_inputTputPerGpu') return 'linear';
  if (scaleType === 'linear') return 'linear';
  if (scaleType === 'log') return extent[0] > 0 ? 'log' : 'linear';

  const isTtftField = xAxisField.endsWith('_ttft');
  return isTtftField && extent[0] > 0 && extent[1] / extent[0] > 10 ? 'log' : 'linear';
}
