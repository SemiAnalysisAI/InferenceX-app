import type { Metadata } from 'next';

import { LazyInferenceDashboard } from '@/components/inference/lazy-inference-dashboard';
import { LazyInferencePageIntro } from '@/components/inference/lazy-inference-page-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('inference');

export default function ZhInferencePage() {
  return (
    <>
      <LazyInferencePageIntro locale="zh" />
      <LazyInferenceDashboard activeTab="inference" centerOnEnter />
    </>
  );
}
