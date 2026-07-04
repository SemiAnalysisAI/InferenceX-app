import type { Metadata } from 'next';

import { ReliabilityProvider } from '@/components/reliability/ReliabilityContext';
import ReliabilityChartDisplay from '@/components/reliability/ui/ChartDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('reliability');

export default function ZhReliabilityPage() {
  return (
    <>
      <ZhTabIntro tab="reliability" />
      <ReliabilityProvider>
        <ReliabilityChartDisplay />
      </ReliabilityProvider>
    </>
  );
}
