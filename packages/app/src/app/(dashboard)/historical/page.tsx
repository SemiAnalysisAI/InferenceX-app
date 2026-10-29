import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('historical');

export default function HistoricalPage() {
  return (
    <>
      <TabIntro tab="historical" />
      <InferenceProvider activeTab="historical">
        <HistoricalTrendsDisplay />
      </InferenceProvider>
    </>
  );
}
