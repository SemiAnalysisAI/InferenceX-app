import type { Metadata } from 'next';

import { EvaluationProvider } from '@/components/evaluation/EvaluationContext';
import EvaluationChartDisplay from '@/components/evaluation/ui/ChartDisplay';
import { NudgeEngine } from '@/components/nudge-engine';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('evaluation');

export default function ZhEvaluationPage() {
  return (
    <>
      <ZhTabIntro tab="evaluation" />
      <EvaluationProvider>
        <EvaluationChartDisplay />
        <NudgeEngine scope="evaluation" />
      </EvaluationProvider>
    </>
  );
}
