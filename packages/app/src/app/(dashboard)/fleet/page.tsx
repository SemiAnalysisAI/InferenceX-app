import type { Metadata } from 'next';

import { LazyFleetLifecycleDisplay } from '@/components/calculator/lazy-calculator-displays';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('fleet');

export default function FleetPage() {
  return (
    <>
      <LazyFleetLifecycleDisplay />
      <TabIntro tab="fleet" />
    </>
  );
}
