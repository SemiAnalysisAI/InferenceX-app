import type { Metadata } from 'next';

import { LazyReliabilityDashboard } from '@/components/reliability/lazy-reliability-dashboard';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('reliability');

export default function ReliabilityPage() {
  return (
    <>
      <LazyReliabilityDashboard />
      <TabIntro tab="reliability" />
    </>
  );
}
