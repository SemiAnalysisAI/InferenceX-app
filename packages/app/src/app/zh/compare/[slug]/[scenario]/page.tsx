import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';

import { buildCompareMetadataZh, renderComparePageZh } from '../page';

export const revalidate = 3600;

export function generateStaticParams(): { scenario: string }[] {
  return [];
}

interface Props {
  params: Promise<{ slug: string; scenario: string }>;
}

function assertScenario(scenario: string): ScenarioSegment {
  if (!sequenceForScenarioSegment(scenario)) notFound();
  return scenario.toLowerCase() as ScenarioSegment;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, scenario } = await params;
  return buildCompareMetadataZh(slug, { scenarioSegment: assertScenario(scenario) });
}

export default async function CompareScenarioPageZh({ params }: Props) {
  const { slug, scenario } = await params;
  return renderComparePageZh(slug, { scenarioSegment: assertScenario(scenario) });
}
