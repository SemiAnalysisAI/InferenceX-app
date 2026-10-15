import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  profitRouteInput,
  type ProfitRouteProps,
} from '@/components/calculator/profit-route-input';
import { modelRouteAvailableForTab, resolveModelRouteSlug } from '@/lib/routing/model-routes';
import { modelTabMetadata } from '@/lib/routing/tab-meta';

/**
 * `/profit-estimator/<model>` — the GW-year profit estimator seeded to a
 * specific model, so every model has an indexable URL. Switching models in
 * the UI rewrites the pathname in place via `history.replaceState` (no reload,
 * no remount), the same mechanism `/calculator/<model>` uses. No
 * `generateStaticParams`: the page reads searchParams, so it renders
 * dynamically anyway.
 */

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
  // A legacy explicit ?g_model= wins over the path, as on /calculator/<model>.
  return (
    <ProfitEstimatorDisplay
      basis="gw-year"
      urlSeed={{
        ...seed,
        model: seed.model ?? resolved.route.model,
        profitRouteKey: JSON.stringify(sp),
      }}
    />
  );
}
