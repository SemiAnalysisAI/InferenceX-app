import type { Metadata } from 'next';

import { EvaluationProvider } from '@/components/evaluation/EvaluationContext';
import EvaluationChartDisplay from '@/components/evaluation/ui/ChartDisplay';
import { NudgeEngine } from '@/components/nudges/nudge-engine';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('evaluation');

export default function ZhEvaluationPage() {
  return (
    <EvaluationProvider>
      <EvaluationChartDisplay />
      <NudgeEngine scope="evaluation" />
    </EvaluationProvider>
  );
}
