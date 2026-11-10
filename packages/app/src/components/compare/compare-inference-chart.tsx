'use client';

import type { ComponentProps } from 'react';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';

export type CompareInferenceChartProps = Omit<ComponentProps<typeof InferenceProvider>, 'children'>;

export default function CompareInferenceChart(props: CompareInferenceChartProps) {
  return (
    <InferenceProvider {...props}>
      <InferenceChartDisplay headerLevel="card" />
    </InferenceProvider>
  );
}
