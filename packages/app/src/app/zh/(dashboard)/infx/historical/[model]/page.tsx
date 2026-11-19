import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';

import { MODEL_ROUTES, modelRoutePath, resolveModelRouteSlug } from '@/lib/routing/model-routes';
import { modelTabCanonicalPath } from '@/lib/routing/tab-meta';
import { modelTabMetadataZh } from '@/lib/routing/tab-meta-zh';

interface Props {
  params: Promise<{ model: string }>;
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

export default async function ZhHistoricalModelPage({ params }: Props) {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  // Prerendered route: reading searchParams here throws DYNAMIC_SERVER_USAGE. next.config
  // redirects known aliases with their query; this only catches other casings.
  if (resolved.isAlias)
    permanentRedirect(`/zh${modelRoutePath('historical', resolved.route.slug)}`);
  return (
    <InferenceProvider activeTab="historical">
      <HistoricalTrendsDisplay />
    </InferenceProvider>
  );
}
