import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import {
  profitRouteInput,
  type ProfitRouteProps,
} from '@/components/calculator/profit-route-input';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import {
  modelRouteAvailableForTab,
  modelRoutesForTab,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import { modelTabCanonicalPath } from '@/lib/routing/tab-meta';
import { MODEL_TAB_META_ZH, modelTabMetadataZh } from '@/lib/routing/tab-meta-zh';

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
  return modelTabMetadataZh(
    'profit-estimator-per-gigawatt',
    resolved.route,
    modelTabCanonicalPath('profit-estimator-per-gigawatt', resolved.route),
  );
}

export default async function ZhProfitEstimatorModelPage({ params }: Props) {
  const resolved = await profitRouteInput('profit-estimator-per-gigawatt', true, params);
  const meta = MODEL_TAB_META_ZH['profit-estimator-per-gigawatt'];
  return (
    <>
      <ProfitEstimatorDisplay basis="gw-year" routeModel={resolved.route.model} />
      <ZhTabIntro
        tab="profit-estimator-per-gigawatt"
        title={meta.title(resolved.route.seoName)}
        intro={meta.intro(resolved.route.seoName)}
      />
    </>
  );
}
