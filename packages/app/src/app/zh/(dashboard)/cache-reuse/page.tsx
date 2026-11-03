import type { Metadata } from 'next';

import CacheReuseDisplay from '@/components/calculator/CacheReuseDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('cache-reuse');

export default function ZhCacheReusePage() {
  return (
    <>
      <CacheReuseDisplay />
      <ZhTabIntro tab="cache-reuse" />
    </>
  );
}
