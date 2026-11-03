'use client';

import { ReliabilityProvider } from '@/components/reliability/ReliabilityContext';
import ReliabilityChartDisplay from '@/components/reliability/ui/ChartDisplay';

export default function ReliabilityDashboard() {
  return (
    <ReliabilityProvider>
      <ReliabilityChartDisplay />
    </ReliabilityProvider>
  );
}
