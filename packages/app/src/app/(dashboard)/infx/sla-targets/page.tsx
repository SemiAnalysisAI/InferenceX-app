import type { Metadata } from 'next';

import SlaTargetsDisplay from '@/components/sla-targets/SlaTargetsDisplay';
import { TabIntro } from '@/components/dashboard/tab-intro';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = {
  ...tabMetadata('sla-targets'),
  robots: { index: false, follow: false },
};

export default function SlaTargetsPage() {
  return (
    <>
      <SlaTargetsDisplay />
      <TabIntro tab="sla-targets" />
    </>
  );
}
