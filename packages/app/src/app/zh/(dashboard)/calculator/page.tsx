import type { Metadata } from 'next';

import { LazyThroughputCalculatorDisplay } from '@/components/calculator/lazy-calculator-displays';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('calculator');

export default function ZhCalculatorPage() {
  return (
    <>
      <LazyThroughputCalculatorDisplay />
      <ZhTabIntro tab="calculator" />
    </>
  );
}
