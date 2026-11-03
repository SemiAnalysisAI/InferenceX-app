import type { Metadata } from 'next';

import { LazyInferenceDashboard } from '@/components/inference/lazy-inference-dashboard';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { LazyInferencePageIntro } from '@/components/inference/lazy-inference-page-intro';

export const metadata: Metadata = tabMetadata('inference');

export default function InferencePage() {
  return (
    <>
      <LazyInferencePageIntro locale="en" />
      <LazyInferenceDashboard activeTab="inference" centerOnEnter />
    </>
  );
}
