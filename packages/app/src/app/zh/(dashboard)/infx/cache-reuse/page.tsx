import type { Metadata } from 'next';

import CacheReuseDisplay from '@/components/calculator/CacheReuseDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('cache-reuse');

export default function ZhCacheReusePage() {
  return <CacheReuseDisplay />;
}
