import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { InferencePageIntro } from '@/components/inference/inference-page-intro';

export const metadata: Metadata = tabMetadata('inference');

export default function InferencePage() {
  return (
    <>
      <InferencePageIntro locale="en" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay />
      </InferenceProvider>
    </>
  );
}
