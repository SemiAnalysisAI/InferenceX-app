import type { Metadata } from 'next';

import { LazyFleetLifecycleDisplay } from '@/components/calculator/lazy-calculator-displays';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('fleet');

export default function ZhFleetPage() {
  return (
    <>
      <LazyFleetLifecycleDisplay />
      <ZhTabIntro tab="fleet" />
    </>
  );
}
