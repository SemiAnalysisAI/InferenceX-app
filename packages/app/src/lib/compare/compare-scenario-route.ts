import { SCENARIO_REGISTRY, type ScenarioKey } from '@semianalysisai/inferencex-constants';

import { Scenario, SCENARIO_OPTIONS } from '@/lib/catalog/data-mappings';

export type ScenarioSegment = (typeof SCENARIO_REGISTRY)[ScenarioKey]['segment'];

export const SCENARIO_BY_SEGMENT = Object.fromEntries(
  SCENARIO_OPTIONS.map((scenario) => [SCENARIO_REGISTRY[scenario].segment, scenario]),
) as Record<ScenarioSegment, Scenario>;

const SEGMENT_BY_SCENARIO = new Map<string, ScenarioSegment>(
  Object.entries(SCENARIO_BY_SEGMENT).map(([segment, scenario]) => [
    scenario,
    segment as ScenarioSegment,
  ]),
);

export const SCENARIO_SEGMENTS = Object.keys(SCENARIO_BY_SEGMENT) as readonly ScenarioSegment[];

/**
 * The scenario children built at deploy time under each prerendered `/compare` and
 * `/compare-per-dollar` slug. These two take about 98% of scenario traffic.
 */
export const PRERENDERED_SCENARIO_SEGMENTS = [
  'agentic',
  '8k-1k',
] as const satisfies readonly ScenarioSegment[];

/** Static params for a `[slug]/[scenario]` page: every prerendered scenario of each slug. */
export function prerenderedScenarioParams(
  slugs: readonly { slug: string }[],
): { slug: string; scenario: ScenarioSegment }[] {
  return slugs.flatMap(({ slug }) =>
    PRERENDERED_SCENARIO_SEGMENTS.map((scenario) => ({ slug, scenario })),
  );
}

export function scenarioForSegment(segment: string): Scenario | null {
  return (
    SCENARIO_BY_SEGMENT[segment as ScenarioSegment] ??
    SCENARIO_BY_SEGMENT[segment.toLowerCase() as ScenarioSegment] ??
    null
  );
}

export function segmentForScenario(scenario: string): ScenarioSegment | null {
  return SEGMENT_BY_SCENARIO.get(scenario) ?? null;
}

export function isAgenticScenario(scenario: string | null | undefined): boolean {
  return scenario === Scenario.AgenticTraces;
}

export function compareScenarioPath(
  basePath: string,
  slug: string,
  scenario: string,
  defaultScenario: string,
): string {
  const segment = segmentForScenario(scenario);
  if (!segment || scenario === defaultScenario) return `${basePath}/${slug}`;
  return `${basePath}/${slug}/${segment}`;
}
