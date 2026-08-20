import { describe, expect, it } from 'vitest';

import {
  compareScenarioPath,
  isAgenticSequence,
  SCENARIO_SEGMENT_TO_SEQUENCE,
  SCENARIO_SEGMENTS,
  scenarioSegmentForSequence,
  sequenceForScenarioSegment,
} from './compare-scenario-route';
import { KNOWN_SEQUENCES } from './compare-ssr';

describe('compare scenario segments', () => {
  it('covers every sequence the query param accepts', () => {
    // If a sequence can be expressed as `?i_seq=`, it needs a path segment
    // too — otherwise a workload exists that the routes cannot address.
    const mapped = new Set<string>(Object.values(SCENARIO_SEGMENT_TO_SEQUENCE));
    expect(mapped).toEqual(new Set(KNOWN_SEQUENCES));
  });

  it('round-trips every segment through its sequence', () => {
    for (const segment of SCENARIO_SEGMENTS) {
      const sequence = sequenceForScenarioSegment(segment);
      expect(sequence).not.toBeNull();
      expect(scenarioSegmentForSequence(sequence!)).toBe(segment);
    }
  });

  it('maps the two headline workloads', () => {
    expect(sequenceForScenarioSegment('agentic')).toBe('agentic-traces');
    expect(sequenceForScenarioSegment('8k-1k')).toBe('8k/1k');
  });

  it('resolves a capitalized segment rather than 404ing', () => {
    expect(sequenceForScenarioSegment('Agentic')).toBe('agentic-traces');
  });

  it('rejects unknown segments so the route can 404', () => {
    expect(sequenceForScenarioSegment('bogus')).toBeNull();
    expect(sequenceForScenarioSegment('')).toBeNull();
    // The raw sequence key is not a valid segment — a slash cannot live in one.
    expect(sequenceForScenarioSegment('8k/1k')).toBeNull();
  });

  it('identifies the agentic sequence', () => {
    expect(isAgenticSequence('agentic-traces')).toBe(true);
    expect(isAgenticSequence('8k/1k')).toBe(false);
    expect(isAgenticSequence(null)).toBe(false);
    expect(isAgenticSequence(undefined)).toBe(false);
  });
});

describe('compareScenarioPath', () => {
  it('emits the bare slug URL for the default workload', () => {
    // The default view keeps exactly one address rather than gaining a second,
    // identical one at a scenario segment.
    expect(
      compareScenarioPath('/compare', 'dsv4-b200-vs-h200', 'agentic-traces', 'agentic-traces'),
    ).toBe('/compare/dsv4-b200-vs-h200');
  });

  it('appends the segment for a non-default workload', () => {
    expect(compareScenarioPath('/compare', 'dsv4-b200-vs-h200', '8k/1k', 'agentic-traces')).toBe(
      '/compare/dsv4-b200-vs-h200/8k-1k',
    );
  });

  it('falls back to the bare URL for an unmapped sequence', () => {
    expect(compareScenarioPath('/compare', 'dsv4-b200-vs-h200', 'nonsense', 'agentic-traces')).toBe(
      '/compare/dsv4-b200-vs-h200',
    );
  });

  it('works for the other compare families', () => {
    expect(
      compareScenarioPath('/zh/compare-per-dollar', 'dsv4-b200-vs-h200', '1k/8k', 'agentic-traces'),
    ).toBe('/zh/compare-per-dollar/dsv4-b200-vs-h200/1k-8k');
  });
});
