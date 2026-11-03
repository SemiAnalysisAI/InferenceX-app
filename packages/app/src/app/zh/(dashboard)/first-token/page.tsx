import type { Metadata } from 'next';

import { LazyFirstTokenLimitsDisplay } from '@/components/calculator/lazy-calculator-displays';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('first-token');

export default function ZhFirstTokenPage() {
  return (
    <>
      <LazyFirstTokenLimitsDisplay />
      <ZhTabIntro tab="first-token" />
    </>
  );
}
