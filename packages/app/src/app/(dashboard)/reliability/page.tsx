import type { Metadata } from 'next';

import { ReliabilityProvider } from '@/components/reliability/ReliabilityContext';
import ReliabilityChartDisplay from '@/components/reliability/ui/ChartDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('reliability');

export default function ReliabilityPage() {
  return (
    <ReliabilityProvider>
      <ReliabilityChartDisplay />
    </ReliabilityProvider>
  );
}
