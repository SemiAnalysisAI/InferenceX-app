import type { Metadata } from 'next';

import { LazyEvaluationDashboard } from '@/components/evaluation/lazy-evaluation-dashboard';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('evaluation');

export default function ZhEvaluationPage() {
  return (
    <>
      <LazyEvaluationDashboard />
      <ZhTabIntro tab="evaluation" />
    </>
  );
}
