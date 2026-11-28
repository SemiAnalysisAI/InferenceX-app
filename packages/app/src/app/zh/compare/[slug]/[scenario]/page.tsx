import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getPrerenderedCompareParams } from '@/lib/compare/compare-availability';
import {
  prerenderedScenarioParams,
  type ScenarioSegment,
  scenarioForSegment,
} from '@/lib/compare/compare-scenario-route';

import { buildCompareMetadataZh, renderComparePageZh } from '../page';

export const revalidate = 86400;

// The slugs the parent page builds, each with its most visited scenarios.
export function generateStaticParams(): Promise<{ slug: string; scenario: string }[]> {
  return getPrerenderedCompareParams().then(prerenderedScenarioParams);
}

interface Props {
  params: Promise<{ slug: string; scenario: string }>;
}

function assertScenario(scenario: string): ScenarioSegment {
  if (!scenarioForSegment(scenario)) notFound();
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
