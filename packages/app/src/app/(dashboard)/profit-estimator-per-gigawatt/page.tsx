import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { defaultRouteModel } from '@/lib/model-routes';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('profit-estimator-per-gigawatt');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Bare `/profit-estimator` opens on the tab's default model (Kimi K3, see
 * `defaultRouteModel`). Switching models in the selector rewrites the address
 * bar to `/profit-estimator/<model>` in place; see the `[model]` sibling.
 */
export default async function ProfitEstimatorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <ProfitEstimatorDisplay
      basis="gw-year"
      urlSeed={{ ...seed, model: seed.model ?? defaultRouteModel('profit-estimator-per-gigawatt') }}
    />
  );
}
