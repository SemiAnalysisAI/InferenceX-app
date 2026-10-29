import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import {
  MODEL_ROUTES,
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import { MODEL_TAB_META, modelTabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

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
  return modelTabMetadata('historical', resolved.route);
}

export default async function HistoricalModelPage({ params, searchParams }: Props) {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  if (resolved.isAlias) {
    permanentRedirect(
      pathWithSearchParams(modelRoutePath('historical', resolved.route.slug), await searchParams),
    );
  }
  return (
    <>
      <TabIntro
        tab="historical"
        title={MODEL_TAB_META.historical.title(resolved.route.seoName)}
        intro={MODEL_TAB_META.historical.intro(resolved.route.seoName)}
      />
      <InferenceProvider activeTab="historical">
        <HistoricalTrendsDisplay />
      </InferenceProvider>
    </>
  );
}
