import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import {
  modelRouteAvailableForTab,
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/model-routes';
import { modelTabCanonicalPath } from '@/lib/tab-meta';
import { MODEL_TAB_META_ZH, modelTabMetadataZh } from '@/lib/tab-meta-zh';

/** Chinese sibling of `/profit-estimator/<model>` (see that page for the
 *  routing and client-side model-switch behavior). */

interface Props {
  params: Promise<{ model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved || !modelRouteAvailableForTab('profit-estimator', resolved.route.model)) return {};
  return modelTabMetadataZh(
    'profit-estimator',
    resolved.route,
    modelTabCanonicalPath('profit-estimator', resolved.route),
  );
}

export default async function ZhProfitEstimatorModelPage({ params, searchParams }: Props) {
  const [{ model }, sp] = await Promise.all([params, searchParams]);
  const resolved = resolveModelRouteSlug(model);
  // Only the models this tab serves (see MODEL_ROUTE_TAB_MODELS) get a page.
  if (!resolved || !modelRouteAvailableForTab('profit-estimator', resolved.route.model)) {
    notFound();
  }
  // Keep share-link params through the 308.
  if (resolved.isAlias) {
    permanentRedirect(
      pathWithSearchParams(`/zh${modelRoutePath('profit-estimator', resolved.route.slug)}`, sp),
    );
  }
  const seed = resolveCalculatorUrlSeed(sp);
  const meta = MODEL_TAB_META_ZH['profit-estimator'];
  return (
    <>
      <ZhTabIntro
        tab="profit-estimator"
        title={meta.title(resolved.route.seoName)}
        intro={meta.intro(resolved.route.seoName)}
      />
      <ProfitEstimatorDisplay urlSeed={{ ...seed, model: seed.model ?? resolved.route.model }} />
    </>
  );
}
