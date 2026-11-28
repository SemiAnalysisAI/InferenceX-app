import { describe, expect, it } from 'bun:test';

import {
  compareScenarioPath,
  isAgenticSequence,
  PRERENDERED_SCENARIO_SEGMENTS,
  prerenderedScenarioParams,
  SCENARIO_SEGMENTS,
  scenarioSegmentForSequence,
  sequenceForScenarioSegment,
} from './compare-scenario-route';
import { Sequence } from '@/lib/catalog/data-mappings';

describe('prerenderedScenarioParams', () => {
  it('pairs every prerendered slug with the agentic and 8k/1k scenarios', () => {
    expect(PRERENDERED_SCENARIO_SEGMENTS.map(sequenceForScenarioSegment)).toEqual([
      Sequence.AgenticTraces,
      Sequence.EightK_OneK,
    ]);
    expect(
      prerenderedScenarioParams([{ slug: 'a-b200-vs-h100' }, { slug: 'b-b300-vs-gb300' }]),
    ).toEqual([
      { slug: 'a-b200-vs-h100', scenario: 'agentic' },
      { slug: 'a-b200-vs-h100', scenario: '8k-1k' },
      { slug: 'b-b300-vs-gb300', scenario: 'agentic' },
      { slug: 'b-b300-vs-gb300', scenario: '8k-1k' },
    ]);
  });

  it('builds nothing when no slug is prerendered', () => {
    expect(prerenderedScenarioParams([])).toEqual([]);
  });
});

describe('compare scenario segments', () => {
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
