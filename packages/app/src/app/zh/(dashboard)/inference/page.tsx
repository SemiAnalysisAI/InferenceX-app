import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { InferencePageIntro } from '@/components/inference/inference-page-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('inference');

export default function ZhInferencePage() {
  return (
    <>
      <InferencePageIntro locale="zh" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay centerOnEnter />
      </InferenceProvider>
    </>
  );
}
