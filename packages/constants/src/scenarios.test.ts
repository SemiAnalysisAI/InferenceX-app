import { describe, it, expect } from 'bun:test';
import { SCENARIO_KEYS, islOslToScenario, rowToScenario, scenarioToIslOsl } from './scenarios';

describe('scenarioToIslOsl', () => {
  it('parses 1k/1k to 1024/1024', () => {
    expect(scenarioToIslOsl('1k/1k')).toEqual({ isl: 1024, osl: 1024 });
  });

  it('parses 1k/8k to 1024/8192', () => {
    expect(scenarioToIslOsl('1k/8k')).toEqual({ isl: 1024, osl: 8192 });
  });

  it('parses 8k/1k to 8192/1024', () => {
    expect(scenarioToIslOsl('8k/1k')).toEqual({ isl: 8192, osl: 1024 });
  });

  it('returns null for scenarios without fixed lengths', () => {
    expect(scenarioToIslOsl('agentic-traces')).toBeNull();
    expect(scenarioToIslOsl('2k/2k')).toBeNull();
    expect(scenarioToIslOsl('')).toBeNull();
    expect(scenarioToIslOsl('invalid')).toBeNull();
  });
});

describe('islOslToScenario', () => {
  it('converts 1024/1024 to 1k/1k', () => {
    expect(islOslToScenario(1024, 1024)).toBe('1k/1k');
  });

  it('converts 1024/8192 to 1k/8k', () => {
    expect(islOslToScenario(1024, 8192)).toBe('1k/8k');
  });

  it('returns null for unmapped ISL/OSL pairs', () => {
    expect(islOslToScenario(2048, 2048)).toBeNull();
    expect(islOslToScenario(0, 0)).toBeNull();
  });

  it('round-trips with scenarioToIslOsl for every fixed-length scenario', () => {
    const fixed = SCENARIO_KEYS.filter((scenario) => scenarioToIslOsl(scenario));
    expect(fixed).toEqual(['1k/1k', '1k/8k', '8k/1k']);
    for (const scenario of fixed) {
      const parsed = scenarioToIslOsl(scenario)!;
      expect(islOslToScenario(parsed.isl, parsed.osl)).toBe(scenario);
    }
  });
});

describe('rowToScenario', () => {
  it('classifies agentic rows by benchmark type and fixed rows by length', () => {
    expect(rowToScenario({ isl: null, osl: null, benchmark_type: 'agentic_traces' })).toBe(
      'agentic-traces',
    );
    expect(rowToScenario({ isl: 8192, osl: 1024, benchmark_type: 'single_turn' })).toBe('8k/1k');
    expect(rowToScenario({ isl: null, osl: 1024, benchmark_type: 'single_turn' })).toBeNull();
  });
});
