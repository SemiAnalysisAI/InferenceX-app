import type { Metadata } from 'next';

import { LazyCacheReuseDisplay } from '@/components/calculator/lazy-calculator-displays';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('cache-reuse');

export default function ZhCacheReusePage() {
  return (
    <>
      <LazyCacheReuseDisplay />
      <ZhTabIntro tab="cache-reuse" />
    </>
  );
}
