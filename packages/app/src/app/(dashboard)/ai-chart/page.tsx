import type { Metadata } from 'next';

import AiChartDisplay from '@/components/ai-chart/AiChartDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('ai-chart');

export default function AiChartPage() {
  return (
    <>
      <AiChartDisplay />
      <TabIntro tab="ai-chart" />
    </>
  );
}
