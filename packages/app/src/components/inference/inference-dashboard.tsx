'use client';

import type { ComponentProps } from 'react';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';

export type InferenceDashboardProps = Omit<ComponentProps<typeof InferenceProvider>, 'children'> &
  NonNullable<ComponentProps<typeof InferenceChartDisplay>>;

export default function InferenceDashboard({
  embedded,
  centerOnEnter,
  ...providerProps
}: InferenceDashboardProps) {
  return (
    <InferenceProvider {...providerProps}>
      <InferenceChartDisplay embedded={embedded} centerOnEnter={centerOnEnter} />
    </InferenceProvider>
  );
}
