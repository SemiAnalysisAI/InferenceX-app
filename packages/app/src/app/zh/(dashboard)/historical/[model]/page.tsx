import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import {
  MODEL_ROUTES,
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/model-routes';
import { modelTabCanonicalPath } from '@/lib/tab-meta';
import { MODEL_TAB_META_ZH, modelTabMetadataZh } from '@/lib/tab-meta-zh';

/** Chinese sibling of `/historical/<model>` (see that page for the routing
 *  and client-side model-switch behavior). */

interface Props {
  params: Promise<{ model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return MODEL_ROUTES.map((route) => ({ model: route.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) return {};
  return modelTabMetadataZh(
    'historical',
    resolved.route,
    modelTabCanonicalPath('historical', resolved.route),
  );
}

export default async function ZhHistoricalModelPage({ params, searchParams }: Props) {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  // Keep share-link params through the 308; awaited only on this branch so
  // the canonical slugs stay statically generated.
  if (resolved.isAlias) {
    permanentRedirect(
      pathWithSearchParams(
        `/zh${modelRoutePath('historical', resolved.route.slug)}`,
        await searchParams,
      ),
    );
  }
  const meta = MODEL_TAB_META_ZH.historical;
  return (
    <>
      <ZhTabIntro
        tab="historical"
        title={meta.title(resolved.route.seoName)}
        intro={meta.intro(resolved.route.seoName)}
      />
      <InferenceProvider activeTab="historical">
        <HistoricalTrendsDisplay />
      </InferenceProvider>
    </>
  );
}
