import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import { modelTabMetadata } from '@/lib/routing/tab-meta';

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
  if (resolved.isAlias) {
    permanentRedirect(pathWithSearchParams(modelRoutePath('calculator', resolved.route.slug), sp));
  }
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <ThroughputCalculatorDisplay urlSeed={{ ...seed, model: seed.model ?? resolved.route.model }} />
  );
}
