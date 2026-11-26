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
import { modelTabCanonicalPath } from '@/lib/routing/tab-meta';
import { modelTabMetadataZh } from '@/lib/routing/tab-meta-zh';

type Props = ProfitRouteProps;

export function generateStaticParams() {
  return modelRoutesForTab('profit-estimator-per-megawatt').map((route) => ({ model: route.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (
    !resolved ||
    !modelRouteAvailableForTab('profit-estimator-per-megawatt', resolved.route.model)
  )
    return {};
  return modelTabMetadataZh(
    'profit-estimator-per-megawatt',
    resolved.route,
    modelTabCanonicalPath('profit-estimator-per-megawatt', resolved.route),
  );
}

export default async function ZhProfitEstimatorModelPage({ params }: Props) {
  const resolved = await profitRouteInput('profit-estimator-per-megawatt', true, params);
  return <ProfitEstimatorDisplay basis="mw-hour" routeModel={resolved.route.model} />;
}
