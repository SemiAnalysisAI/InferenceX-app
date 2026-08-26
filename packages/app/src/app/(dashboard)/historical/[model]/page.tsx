import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import HistoricalTrendsDisplay from '@/components/trends/HistoricalTrendsDisplay';
import {
  MODEL_ROUTES,
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/model-routes';
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
  // Aliases and non-canonical casing 308 to the canonical slug, keeping any
  // share-link params, mirroring /compare/[slug]. `searchParams` is awaited
  // only on this branch so the canonical slugs stay statically generated.
  if (resolved.isAlias) {
    permanentRedirect(
      pathWithSearchParams(modelRoutePath('historical', resolved.route.slug), await searchParams),
    );
  }
  return (
    <InferenceProvider activeTab="historical">
      <HistoricalTrendsDisplay />
    </InferenceProvider>
  );
}
