import type { Metadata } from 'next';

import AiChartDisplay from '@/components/ai-chart/AiChartDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('ai-chart');

export default function ZhAiChartPage() {
  return <AiChartDisplay />;
}
