import type { Metadata } from 'next';

import { LazyPowerXDashboard } from '@/components/powerx/lazy-powerx-dashboard';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('powerx');

export default function PowerXPage() {
  return (
    <LazyPowerXDashboard locale="en">
      <TabIntro tab="powerx" />
    </LazyPowerXDashboard>
  );
}
