import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { inferenceTableYValue } from '@/components/inference/utils/inference-table-data';

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
