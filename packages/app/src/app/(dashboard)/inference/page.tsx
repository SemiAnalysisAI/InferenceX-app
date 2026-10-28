import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('inference');

export default function InferencePage() {
  return (
    <>
      <TabIntro tab="inference" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay />
      </InferenceProvider>
    </>
  );
}
