/**
 * Scenario path segments for the compare families.
 *
 * The workload used to live only in `?i_seq=agentic-traces`. It is now also
 * addressable as a path segment — `/compare/<slug>/agentic`,
 * `/compare/<slug>/8k-1k` — so each workload has a real URL that can be
 * linked, shared, and indexed on its own.
 *
 * The segment is the sequence key with `/` swapped for `-`, because a literal
 * slash cannot live inside one path segment. Every `KNOWN_SEQUENCES` value has
 * a segment, so the scheme is closed: there is no workload the query param can
 * express that a route cannot.
 *
 * `/compare/<slug>` keeps working and keeps rendering the pair's default
 * workload (agentic where the model has AgentX data, otherwise the fixed
 * sequence the pair actually has rows for). Existing `?i_seq=` links keep
 * working too; a scenario segment simply outranks the query param.
 */

import { Sequence } from '@/lib/data-mappings';

/** Path segment → sequence key. Ordered as the selector lists them. */
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

/** `"agentic"` → `"agentic-traces"`; anything else → `null` (the route 404s). */
export function sequenceForScenarioSegment(segment: string): Sequence | null {
  return (
    SCENARIO_SEGMENT_TO_SEQUENCE[segment as ScenarioSegment] ??
    // A case-insensitive match still resolves rather than 404ing — the segment
    // is user-typed often enough (shared links, docs) that a capitalized
    // `/Agentic` should reach the page.
    SCENARIO_SEGMENT_TO_SEQUENCE[segment.toLowerCase() as ScenarioSegment] ??
    null
  );
}

/** `"agentic-traces"` → `"agentic"`. Returns `null` for an unmapped sequence. */
export function scenarioSegmentForSequence(sequence: string): ScenarioSegment | null {
  return SEQUENCE_TO_SCENARIO_SEGMENT.get(sequence) ?? null;
}

export function isAgenticSequence(sequence: string | null | undefined): boolean {
  return sequence === Sequence.AgenticTraces;
}

/**
 * URL for a compare page at a given workload. Emits the bare slug URL when the
 * workload is the pair's default, so the default view keeps exactly one
 * address rather than gaining a second, identical one at a scenario segment.
 */
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
