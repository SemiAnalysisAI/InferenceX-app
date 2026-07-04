import type { Metadata } from 'next';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('calculator');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ZhCalculatorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <>
      <ZhTabIntro tab="calculator" />
      <ThroughputCalculatorDisplay urlSeed={seed} />
    </>
  );
}
