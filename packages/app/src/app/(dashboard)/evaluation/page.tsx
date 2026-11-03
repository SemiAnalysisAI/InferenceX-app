import type { Metadata } from 'next';

import { LazyEvaluationDashboard } from '@/components/evaluation/lazy-evaluation-dashboard';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('evaluation');

export default function EvaluationPage() {
  return (
    <>
      <LazyEvaluationDashboard />
      <TabIntro tab="evaluation" />
    </>
  );
}
