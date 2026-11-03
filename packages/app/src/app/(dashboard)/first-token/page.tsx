import type { Metadata } from 'next';

import { LazyFirstTokenLimitsDisplay } from '@/components/calculator/lazy-calculator-displays';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('first-token');

export default function FirstTokenPage() {
  return (
    <>
      <LazyFirstTokenLimitsDisplay />
      <TabIntro tab="first-token" />
    </>
  );
}
