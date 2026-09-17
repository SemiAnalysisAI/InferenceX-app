import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  modelRouteAvailableForTab,
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/model-routes';
import { modelTabMetadata } from '@/lib/tab-meta';

/**
 * `/profit-estimator/<model>` — the GW-year profit estimator seeded to a
 * specific model, so every model has an indexable URL. Switching models in
 * the UI rewrites the pathname in place via `history.replaceState` (no reload,
 * no remount), the same mechanism `/calculator/<model>` uses. No
 * `generateStaticParams`: the page reads searchParams, so it renders
 * dynamically anyway.
 */

interface Props {
  params: Promise<{ model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved || !modelRouteAvailableForTab('profit-estimator', resolved.route.model)) return {};
  return modelTabMetadata('profit-estimator', resolved.route);
}

export default async function ProfitEstimatorModelPage({ params, searchParams }: Props) {
  const [{ model }, sp] = await Promise.all([params, searchParams]);
  const resolved = resolveModelRouteSlug(model);
  // Only the models this tab serves (see MODEL_ROUTE_TAB_MODELS) get a page.
  if (!resolved || !modelRouteAvailableForTab('profit-estimator', resolved.route.model)) {
    notFound();
  }
  // Aliases and non-canonical casing 308 to the canonical slug, keeping any
  // share-link params.
  if (resolved.isAlias) {
    permanentRedirect(
      pathWithSearchParams(modelRoutePath('profit-estimator', resolved.route.slug), sp),
    );
  }
  const seed = resolveCalculatorUrlSeed(sp);
  // A legacy explicit ?g_model= wins over the path, as on /calculator/<model>.
  return (
    <ProfitEstimatorDisplay
      basis="chip-hour"
      urlSeed={{ ...seed, model: seed.model ?? resolved.route.model }}
    />
  );
}
