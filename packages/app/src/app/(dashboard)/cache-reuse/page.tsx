import type { Metadata } from 'next';

import { LazyCacheReuseDisplay } from '@/components/calculator/lazy-calculator-displays';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('cache-reuse');

export default function CacheReusePage() {
  return (
    <>
      <LazyCacheReuseDisplay />
      <TabIntro tab="cache-reuse" />
    </>
  );
}
