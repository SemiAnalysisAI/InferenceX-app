import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('profit-estimator');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ZhProfitEstimatorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <>
      <ZhTabIntro tab="profit-estimator" />
      <ProfitEstimatorDisplay urlSeed={seed} />
    </>
  );
}
