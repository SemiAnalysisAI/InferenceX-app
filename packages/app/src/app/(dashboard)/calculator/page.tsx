import type { Metadata } from 'next';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('calculator');

export default function CalculatorPage() {
  return <ThroughputCalculatorDisplay />;
}
