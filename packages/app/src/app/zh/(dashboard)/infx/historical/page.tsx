import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('historical');

export default function ZhHistoricalPage() {
  return (
    <InferenceProvider activeTab="historical">
      <HistoricalTrendsDisplay />
    </InferenceProvider>
  );
}
