import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';

import { buildPrecisionMetadataZh, renderPrecisionPageZh } from '../page';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string; scenario: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function assertScenario(scenario: string): ScenarioSegment {
  if (!sequenceForScenarioSegment(scenario)) notFound();
  return scenario.toLowerCase() as ScenarioSegment;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, scenario } = await params;
  return buildPrecisionMetadataZh(slug, { scenarioSegment: assertScenario(scenario) });
}

export default async function PrecisionScenarioPageZh({ params, searchParams }: Props) {
  const { slug, scenario } = await params;
  return renderPrecisionPageZh(slug, await searchParams, {
    scenarioSegment: assertScenario(scenario),
  });
}
