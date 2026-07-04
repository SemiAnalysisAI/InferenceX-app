import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('inference');

export default function ZhInferencePage() {
  return (
    <>
      <ZhTabIntro tab="inference" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay />
      </InferenceProvider>
    </>
  );
}
