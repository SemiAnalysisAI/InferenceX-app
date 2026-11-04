import type { Metadata } from 'next';

import CacheReuseDisplay from '@/components/calculator/CacheReuseDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('cache-reuse');

export default function CacheReusePage() {
  return (
    <>
      <CacheReuseDisplay />
      <TabIntro tab="cache-reuse" />
    </>
  );
}
