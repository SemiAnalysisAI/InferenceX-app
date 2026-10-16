import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { inferenceTableYValue } from '@/components/inference/utils/inference-table-data';

/**
 * Default row order for the inference table.
 *
 * The y-metric's declared Pareto corner is the only signal for which way is
 * "better": a `lower_*` corner means smaller is better, so those metrics sort
 * ascending (best row first). Everything else sorts descending. A metric with
 * no declared corner therefore lands on the descending branch, which is why an
 * undeclared lower-is-better axis (e.g. measured power before it was given a
 * direction) shows the worst configuration at the top.
 */
export function sortRowsByYMetric(
  data: InferenceData[],
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
): InferenceData[] {
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  if (!yPath) return data;

  const rooflineDir = chartDefinition[
    `${selectedYAxisMetric}_roofline` as keyof ChartDefinition
  ] as string | undefined;
  const yAscending = rooflineDir?.startsWith('lower');

  return [...data].toSorted((a, b) => {
    const ay = inferenceTableYValue(a, yPath);
    const by = inferenceTableYValue(b, yPath);
    if (ay === null) return by === null ? 0 : 1;
    if (by === null) return -1;
    return yAscending ? ay - by : by - ay;
  });
}
