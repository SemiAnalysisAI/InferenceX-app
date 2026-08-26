import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import { MODEL_ROUTES, modelRoutePath, resolveModelRouteSlug } from '@/lib/model-routes';
import { modelTabMetadata } from '@/lib/tab-meta';

/**
 * `/historical/<model>` — the Historical Trends tab seeded to a specific
 * model, giving every model an indexable URL. `GlobalFilterProvider` (mounted
 * by the dashboard shell) reads the model straight from the pathname, so the
 * page body is identical to the bare tab; switching models in the UI rewrites
 * the pathname in place via `history.replaceState` (no reload, no remount).
 */

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
  return modelTabMetadata('historical', resolved.route);
}

export default async function HistoricalModelPage({ params }: Props) {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  // Aliases and non-canonical casing 308 to the canonical slug, mirroring
  // /compare/[slug].
  if (resolved.isAlias) permanentRedirect(modelRoutePath('historical', resolved.route.slug));
  return (
    <InferenceProvider activeTab="historical">
      <HistoricalTrendsDisplay />
    </InferenceProvider>
  );
}
