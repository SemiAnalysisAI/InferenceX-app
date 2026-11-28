import { describe, expect, it } from 'bun:test';

import {
  compareScenarioPath,
  isAgenticScenario,
  PRERENDERED_SCENARIO_SEGMENTS,
  prerenderedScenarioParams,
  SCENARIO_SEGMENTS,
  segmentForScenario,
  scenarioForSegment,
} from './compare-scenario-route';
import { Scenario } from '@/lib/catalog/data-mappings';

describe('prerenderedScenarioParams', () => {
  it('pairs every prerendered slug with the agentic and 8k/1k scenarios', () => {
    expect(PRERENDERED_SCENARIO_SEGMENTS.map(scenarioForSegment)).toEqual([
      Scenario.AgenticTraces,
      Scenario.EightK_OneK,
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
      const scenario = scenarioForSegment(segment);
      expect(scenario).not.toBeNull();
      expect(segmentForScenario(scenario!)).toBe(segment);
    }
  });

  it('maps the two headline workloads', () => {
    expect(scenarioForSegment('agentic')).toBe('agentic-traces');
    expect(scenarioForSegment('8k-1k')).toBe('8k/1k');
  });

  it('resolves a capitalized segment rather than 404ing', () => {
    expect(scenarioForSegment('Agentic')).toBe('agentic-traces');
  });

  it('rejects unknown segments so the route can 404', () => {
    expect(scenarioForSegment('bogus')).toBeNull();
    expect(scenarioForSegment('')).toBeNull();
    expect(scenarioForSegment('8k/1k')).toBeNull();
  });

  it('identifies the agentic sequence', () => {
    expect(isAgenticScenario('agentic-traces')).toBe(true);
    expect(isAgenticScenario('8k/1k')).toBe(false);
    expect(isAgenticScenario(null)).toBe(false);
    expect(isAgenticScenario(undefined)).toBe(false);
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
