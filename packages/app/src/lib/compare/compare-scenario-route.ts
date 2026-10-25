import { Sequence } from '@/lib/catalog/data-mappings';

export const SCENARIO_SEGMENT_TO_SEQUENCE = {
  agentic: Sequence.AgenticTraces,
  '8k-1k': Sequence.EightK_OneK,
  '1k-1k': Sequence.OneK_OneK,
  '1k-8k': Sequence.OneK_EightK,
} as const satisfies Record<string, Sequence>;

export type ScenarioSegment = keyof typeof SCENARIO_SEGMENT_TO_SEQUENCE;

const SEQUENCE_TO_SCENARIO_SEGMENT = new Map<string, ScenarioSegment>(
  Object.entries(SCENARIO_SEGMENT_TO_SEQUENCE).map(([segment, sequence]) => [
    sequence,
    segment as ScenarioSegment,
  ]),
);

export const SCENARIO_SEGMENTS = Object.keys(
  SCENARIO_SEGMENT_TO_SEQUENCE,
) as readonly ScenarioSegment[];

export function sequenceForScenarioSegment(segment: string): Sequence | null {
  return (
    SCENARIO_SEGMENT_TO_SEQUENCE[segment as ScenarioSegment] ??
    SCENARIO_SEGMENT_TO_SEQUENCE[segment.toLowerCase() as ScenarioSegment] ??
    null
  );
}

export function scenarioSegmentForSequence(sequence: string): ScenarioSegment | null {
  return SEQUENCE_TO_SCENARIO_SEGMENT.get(sequence) ?? null;
}

export function isAgenticSequence(sequence: string | null | undefined): boolean {
  return sequence === Sequence.AgenticTraces;
}

export function compareScenarioPath(
  basePath: string,
  slug: string,
  sequence: string,
  defaultSequence: string,
): string {
  const segment = scenarioSegmentForSequence(sequence);
  if (!segment || sequence === defaultSequence) return `${basePath}/${slug}`;
  return `${basePath}/${slug}/${segment}`;
}
