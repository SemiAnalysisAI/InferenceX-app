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
import { modelTabMetadata } from '@/lib/routing/tab-meta';

type Props = ProfitRouteProps;

export function generateStaticParams() {
  return modelRoutesForTab('profit-estimator-per-million-dollars').map((route) => ({
    model: route.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (
    !resolved ||
    !modelRouteAvailableForTab('profit-estimator-per-million-dollars', resolved.route.model)
  )
    return {};
  return modelTabMetadata('profit-estimator-per-million-dollars', resolved.route);
}

export default async function ProfitEstimatorModelPage({ params }: Props) {
  const resolved = await profitRouteInput('profit-estimator-per-million-dollars', false, params);
  return <ProfitEstimatorDisplay basis="spend-1m" routeModel={resolved.route.model} />;
}
