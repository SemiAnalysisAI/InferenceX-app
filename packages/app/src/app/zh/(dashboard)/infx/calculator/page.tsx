import type { Metadata } from 'next';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('calculator');

export default function ZhCalculatorPage() {
  return (
    <>
      <ThroughputCalculatorDisplay />
      <ZhTabIntro tab="calculator" />
    </>
  );
}
