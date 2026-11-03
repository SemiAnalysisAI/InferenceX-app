import type { Metadata } from 'next';

import { LazyHistoricalTrendsDashboard } from '@/components/trends/lazy-historical-trends-dashboard';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('historical');

export default function HistoricalPage() {
  return (
    <>
      <LazyHistoricalTrendsDashboard />
      <TabIntro tab="historical" />
    </>
  );
}
