import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import {
  profitRouteInput,
  type ProfitRouteProps,
} from '@/components/calculator/profit-route-input';
import {
  modelRouteAvailableForTab,
  modelRoutesForTab,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import { MODEL_TAB_META, modelTabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

type Props = ProfitRouteProps;

export function generateStaticParams() {
  return modelRoutesForTab('profit-estimator-per-gigawatt').map((route) => ({ model: route.slug }));
}

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

export default async function ProfitEstimatorModelPage({ params }: Props) {
  const resolved = await profitRouteInput('profit-estimator-per-gigawatt', false, params);
  return (
    <>
      <ProfitEstimatorDisplay basis="gw-year" routeModel={resolved.route.model} />
      <TabIntro
        tab="profit-estimator-per-gigawatt"
        title={MODEL_TAB_META['profit-estimator-per-gigawatt'].heading(resolved.route.seoName)}
        intro={MODEL_TAB_META['profit-estimator-per-gigawatt'].intro(resolved.route.seoName)}
      />
    </>
  );
}
