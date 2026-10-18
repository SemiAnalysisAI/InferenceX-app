import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  profitRouteInput,
  type ProfitRouteProps,
} from '@/components/calculator/profit-route-input';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { modelRouteAvailableForTab, resolveModelRouteSlug } from '@/lib/routing/model-routes';
import { modelTabCanonicalPath } from '@/lib/routing/tab-meta';
import { MODEL_TAB_META_ZH, modelTabMetadataZh } from '@/lib/routing/tab-meta-zh';

/** Chinese sibling of `/profit-estimator/<model>` (see that page for the
 *  routing and client-side model-switch behavior). */

type Props = ProfitRouteProps;

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

export default async function ZhProfitEstimatorModelPage({ params, searchParams }: Props) {
  const { resolved, searchParams: sp } = await profitRouteInput(
    'profit-estimator-per-gigawatt',
    true,
    { params, searchParams },
  );
  const seed = resolveCalculatorUrlSeed(sp);
  const meta = MODEL_TAB_META_ZH['profit-estimator-per-gigawatt'];
  return (
    <>
      <ZhTabIntro
        tab="profit-estimator-per-gigawatt"
        title={meta.title(resolved.route.seoName)}
        intro={meta.intro(resolved.route.seoName)}
      />
      <ProfitEstimatorDisplay
        basis="gw-year"
        urlSeed={{
          ...seed,
          model: seed.model ?? resolved.route.model,
          profitRouteKey: JSON.stringify(sp),
        }}
      />
    </>
  );
}
