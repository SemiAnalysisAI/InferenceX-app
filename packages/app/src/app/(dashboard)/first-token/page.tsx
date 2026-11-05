import type { Metadata } from 'next';

import FirstTokenLimitsDisplay from '@/components/calculator/FirstTokenLimitsDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('first-token');

export default function FirstTokenPage() {
  return (
    <>
      <FirstTokenLimitsDisplay />
      <TabIntro tab="first-token" />
    </>
  );
}
