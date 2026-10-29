import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('profit-estimator-per-gigawatt');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProfitEstimatorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <>
      <TabIntro tab="profit-estimator-per-gigawatt" />
      <ProfitEstimatorDisplay
        basis="gw-year"
        urlSeed={{
          ...seed,
          model: seed.model ?? defaultRouteModel('profit-estimator-per-gigawatt'),
        }}
      />
    </>
  );
}
