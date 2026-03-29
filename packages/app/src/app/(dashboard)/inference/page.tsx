import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('inference');

export default function InferencePage() {
  return (
    <InferenceProvider activeTab="inference">
      <InferenceChartDisplay />
    </InferenceProvider>
  );
}
