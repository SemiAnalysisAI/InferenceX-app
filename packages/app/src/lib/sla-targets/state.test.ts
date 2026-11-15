import { describe, expect, it } from 'vitest';

import { SLA_EXAMPLE_TARGETS } from '@semianalysisai/inferencex-constants';

import {
  attainmentPercent,
  clampAttainmentPercent,
  parseSlaTargetsState,
  parseTargetInput,
  serializeSlaTargetsState,
  SLA_DEFAULT_STATE,
} from './state';

describe('parseSlaTargetsState', () => {
  it('starts from the example targets with the end-to-end target off', () => {
    expect(parseSlaTargetsState({})).toEqual(SLA_DEFAULT_STATE);
    expect(SLA_DEFAULT_STATE.targets).toEqual(SLA_EXAMPLE_TARGETS);
    expect(SLA_DEFAULT_STATE.targets.maxE2eS).toBeNull();
  });

  it('keeps any positive target as entered, without snapping it to a step', () => {
    const state = parseSlaTargetsState({
      s_model: 'Kimi-K3.1-Pro',
      s_seq: 'agentic-traces',
      s_ttft: '737.45',
      s_tpot: '33.3',
      s_e2e: '12.5',
      s_att: '99.5',
      s_cost: 'rental',
    });
    expect(state).toEqual({
      model: 'Kimi-K3.1-Pro',
      workload: 'agentic-traces',
      targets: { maxTtftMs: 737.45, maxTpotMs: 33.3, maxE2eS: 12.5, requiredAttainment: 0.995 },
      costTier: 'rental',
    });
  });

  it('falls back to the example for a target that is not a usable number', () => {
    const state = parseSlaTargetsState({ s_ttft: 'fast', s_tpot: '-3', s_e2e: '0', s_att: 'x' });
    expect(state.targets).toEqual(SLA_EXAMPLE_TARGETS);
  });

  it('clamps the required attainment into the supported range', () => {
    expect(parseSlaTargetsState({ s_att: '100' }).targets.requiredAttainment).toBe(0.9999);
    expect(parseSlaTargetsState({ s_att: '10' }).targets.requiredAttainment).toBe(0.5);
    expect(clampAttainmentPercent(99.999)).toBe(99.99);
    expect(attainmentPercent(0.995)).toBe(99.5);
  });
});

describe('serializeSlaTargetsState', () => {
  it('writes defaults as empty values and round-trips everything else', () => {
    expect(serializeSlaTargetsState(SLA_DEFAULT_STATE)).toEqual({
      s_model: '',
      s_seq: '',
      s_ttft: '',
      s_tpot: '',
      s_e2e: '',
      s_att: '',
      s_cost: '',
    });
    const params = {
      s_model: 'GLM-5.3-Flash',
      s_seq: 'agentic-traces',
      s_ttft: '10000',
      s_tpot: '42.5',
      s_e2e: '90',
      s_att: '99.9',
      s_cost: 'rental',
    };
    expect(serializeSlaTargetsState(parseSlaTargetsState(params))).toEqual(params);
  });
});

describe('parseTargetInput', () => {
  it('accepts positive numbers up to the limit and nothing else', () => {
    expect(parseTargetInput('1500', 3_600_000)).toBe(1500);
    expect(parseTargetInput(' 0.5 ', 3_600_000)).toBe(0.5);
    for (const raw of ['', ' ', '0', '-1', 'abc', '1e12', undefined]) {
      expect(parseTargetInput(raw, 3_600_000)).toBeNull();
    }
  });
});
