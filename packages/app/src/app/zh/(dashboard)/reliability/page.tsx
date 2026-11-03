import type { Metadata } from 'next';

import { LazyReliabilityDashboard } from '@/components/reliability/lazy-reliability-dashboard';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('reliability');

export default function ZhReliabilityPage() {
  return (
    <>
      <LazyReliabilityDashboard />
      <ZhTabIntro tab="reliability" />
    </>
  );
}
