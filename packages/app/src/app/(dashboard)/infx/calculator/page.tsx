import type { Metadata } from 'next';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('calculator');

export default function CalculatorPage() {
  return (
    <>
      <ThroughputCalculatorDisplay />
      <TabIntro tab="calculator" />
    </>
  );
}
