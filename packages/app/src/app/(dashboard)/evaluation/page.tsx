import type { Metadata } from 'next';

import { EvaluationProvider } from '@/components/evaluation/EvaluationContext';
import EvaluationChartDisplay from '@/components/evaluation/ui/ChartDisplay';
import { NudgeEngine } from '@/components/nudges/nudge-engine';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('evaluation');

export default function EvaluationPage() {
  return (
    <>
      <TabIntro tab="evaluation" />
      <EvaluationProvider>
        <EvaluationChartDisplay />
        <NudgeEngine scope="evaluation" />
      </EvaluationProvider>
    </>
  );
}
