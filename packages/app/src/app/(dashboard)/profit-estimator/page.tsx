import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('profit-estimator');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfitEstimatorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return <ProfitEstimatorDisplay urlSeed={seed} />;
}
