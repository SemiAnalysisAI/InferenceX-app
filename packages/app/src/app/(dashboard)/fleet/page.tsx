import type { Metadata } from 'next';

import FleetLifecycleDisplay from '@/components/calculator/FleetLifecycleDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('fleet');

export default function FleetPage() {
  return (
    <>
      <FleetLifecycleDisplay />
      <TabIntro tab="fleet" />
    </>
  );
}
