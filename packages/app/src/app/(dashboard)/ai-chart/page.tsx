import type { Metadata } from 'next';

import AiChartDisplay from '@/components/ai-chart/AiChartDisplay';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('ai-chart');

export default function AiChartPage() {
  return <AiChartDisplay />;
}
