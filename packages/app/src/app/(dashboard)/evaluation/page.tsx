import type { Metadata } from 'next';

import { EvaluationProvider } from '@/components/evaluation/EvaluationContext';
import EvaluationChartDisplay from '@/components/evaluation/ui/ChartDisplay';
import { NudgeEngine } from '@/components/nudge-engine';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('evaluation');

export default function EvaluationPage() {
  return (
    <EvaluationProvider>
      <EvaluationChartDisplay />
      <NudgeEngine scope="evaluation" />
    </EvaluationProvider>
  );
}
