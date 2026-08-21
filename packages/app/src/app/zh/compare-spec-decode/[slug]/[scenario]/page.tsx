import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { type ScenarioSegment, sequenceForScenarioSegment } from '@/lib/compare-scenario-route';

import { buildSpecDecodeMetadataZh, renderSpecDecodePageZh } from '../page';

/**
 * `/zh/compare-spec-decode/<slug>/<scenario>` — the same comparison with its workload pinned by
 * the path instead of `?i_seq=`. Both routes render through the parent's
 * exported body, so the two URLs cannot drift.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string; scenario: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Reject unknown segments rather than silently falling back to the pair's
 *  default, which would serve 200s for arbitrary junk paths. */
function assertScenario(scenario: string): ScenarioSegment {
  if (!sequenceForScenarioSegment(scenario)) notFound();
  return scenario.toLowerCase() as ScenarioSegment;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, scenario } = await params;
  return buildSpecDecodeMetadataZh(slug, { scenarioSegment: assertScenario(scenario) });
}

export default async function SpecDecodeScenarioPageZh({ params, searchParams }: Props) {
  const { slug, scenario } = await params;
  return renderSpecDecodePageZh(slug, await searchParams, {
    scenarioSegment: assertScenario(scenario),
  });
}
