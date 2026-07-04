import type { Metadata } from 'next';

import AiChartDisplay from '@/components/ai-chart/AiChartDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('ai-chart');

export default function ZhAiChartPage() {
  return (
    <>
      <ZhTabIntro tab="ai-chart" />
      <AiChartDisplay />
    </>
  );
}
