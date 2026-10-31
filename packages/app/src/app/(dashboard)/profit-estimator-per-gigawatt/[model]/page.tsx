import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  profitRouteInput,
  type ProfitRouteProps,
} from '@/components/calculator/profit-route-input';
import { modelRouteAvailableForTab, resolveModelRouteSlug } from '@/lib/routing/model-routes';
import { MODEL_TAB_META, modelTabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

type Props = ProfitRouteProps;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (
    !resolved ||
    !modelRouteAvailableForTab('profit-estimator-per-gigawatt', resolved.route.model)
  )
    return {};
  return modelTabMetadata('profit-estimator-per-gigawatt', resolved.route);
}

export default async function ProfitEstimatorModelPage({ params, searchParams }: Props) {
  const { resolved, searchParams: sp } = await profitRouteInput(
    'profit-estimator-per-gigawatt',
    false,
    { params, searchParams },
  );
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <>
      <ProfitEstimatorDisplay
        basis="gw-year"
        urlSeed={{
          ...seed,
          model: seed.model ?? resolved.route.model,
          profitRouteKey: JSON.stringify(sp),
        }}
      />
      <TabIntro
        tab="profit-estimator-per-gigawatt"
        title={MODEL_TAB_META['profit-estimator-per-gigawatt'].title(resolved.route.seoName)}
        intro={MODEL_TAB_META['profit-estimator-per-gigawatt'].intro(resolved.route.seoName)}
      />
    </>
  );
}
