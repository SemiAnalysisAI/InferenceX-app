'use client';

import { EvaluationProvider } from '@/components/evaluation/EvaluationContext';
import EvaluationChartDisplay from '@/components/evaluation/ui/ChartDisplay';
import { NudgeEngine } from '@/components/nudges/nudge-engine';

export default function EvaluationDashboard() {
  return (
    <EvaluationProvider>
      <EvaluationChartDisplay />
      <NudgeEngine scope="evaluation" />
    </EvaluationProvider>
  );
}
