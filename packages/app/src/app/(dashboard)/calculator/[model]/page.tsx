import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { modelRoutePath, pathWithSearchParams, resolveModelRouteSlug } from '@/lib/model-routes';
import { modelTabMetadata } from '@/lib/tab-meta';

/**
 * `/calculator/<model>` — the Throughput & TCO calculator seeded to a specific
 * model, giving every model an indexable URL. Switching models in the UI
 * rewrites the pathname in place via `history.replaceState` (no reload, no
 * remount). No `generateStaticParams`: like the bare /calculator route this
 * page reads searchParams, so it renders dynamically anyway.
 */

interface Props {
  params: Promise<{ model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) return {};
  return modelTabMetadata('calculator', resolved.route);
}

export default async function CalculatorModelPage({ params, searchParams }: Props) {
  const [{ model }, sp] = await Promise.all([params, searchParams]);
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  // Aliases and non-canonical casing 308 to the canonical slug, keeping any
  // share-link params, mirroring /compare/[slug].
  if (resolved.isAlias) {
    permanentRedirect(pathWithSearchParams(modelRoutePath('calculator', resolved.route.slug), sp));
  }
  const seed = resolveCalculatorUrlSeed(sp);
  // A legacy explicit ?g_model= wins over the path — same precedence as
  // GlobalFilterProvider, which then canonicalizes the pathname client-side.
  return (
    <ThroughputCalculatorDisplay urlSeed={{ ...seed, model: seed.model ?? resolved.route.model }} />
  );
}
