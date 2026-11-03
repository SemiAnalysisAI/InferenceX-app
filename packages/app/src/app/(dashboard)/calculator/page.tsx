import type { Metadata } from 'next';

import { LazyThroughputCalculatorDisplay } from '@/components/calculator/lazy-calculator-displays';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('calculator');

export default function CalculatorPage() {
  return (
    <>
      <LazyThroughputCalculatorDisplay />
      <TabIntro tab="calculator" />
    </>
  );
}
