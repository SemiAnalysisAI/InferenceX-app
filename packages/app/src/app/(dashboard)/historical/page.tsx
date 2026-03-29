import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('historical');

export default function HistoricalPage() {
  return (
    <InferenceProvider activeTab="historical">
      <HistoricalTrendsDisplay />
    </InferenceProvider>
  );
}
