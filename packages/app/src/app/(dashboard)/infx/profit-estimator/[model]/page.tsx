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
  return modelRoutesForTab('profit-estimator').map((route) => ({ model: route.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved || !modelRouteAvailableForTab('profit-estimator', resolved.route.model)) return {};
  return modelTabMetadata('profit-estimator', resolved.route);
}

export default async function ProfitEstimatorModelPage({ params }: Props) {
  const resolved = await profitRouteInput('profit-estimator', false, params);
  return (
    <>
      <ProfitEstimatorDisplay basis="chip-hour" routeModel={resolved.route.model} />
      <TabIntro
        tab="profit-estimator"
        title={MODEL_TAB_META['profit-estimator'].heading(resolved.route.seoName)}
        intro={MODEL_TAB_META['profit-estimator'].intro(resolved.route.seoName)}
      />
    </>
  );
}
