import type { Metadata } from 'next';

import { LazyHistoricalTrendsDashboard } from '@/components/trends/lazy-historical-trends-dashboard';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('historical');

export default function ZhHistoricalPage() {
  return (
    <>
      <LazyHistoricalTrendsDashboard />
      <ZhTabIntro tab="historical" />
    </>
  );
}
