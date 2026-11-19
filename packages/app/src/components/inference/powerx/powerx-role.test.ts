import { describe, expect, it } from 'vitest';

import {
  powerRoleHiddenVariants,
  powerRoleTableRows,
  powerXRoleTitle,
  resolvePowerXRole,
  rewriteLegacyPowerRoleParams,
} from './powerx-role';

describe('rewriteLegacyPowerRoleParams', () => {
  it.each([
    ['y_measuredPrefillAvgPower', null, 'y_measuredAvgPower', null, 'prefill'],
    ['y_measuredDecodeAvgPower', null, 'y_measuredAvgPower', null, 'decode'],
    ['y_measuredPrefillJPerInputToken', null, 'y_measuredJPerInputToken', null, 'prefill'],
    ['y_measuredDecodeJPerOutputToken', null, 'y_measuredJPerOutputToken', null, 'decode'],
    ['y_measuredAvgPower', 'roles', 'y_measuredAvgPower', 'breakdown', 'split'],
  ])('rewrites %s / %s onto i_role', (metric, compare, nextMetric, nextCompare, role) => {
    expect(rewriteLegacyPowerRoleParams({ metric, compare, role: null })).toEqual({
      metric: nextMetric,
      compare: nextCompare,
      role,
    });
  });

  it('keeps an explicit i_role over the one an old metric implied', () => {
    expect(
      rewriteLegacyPowerRoleParams({
        metric: 'y_measuredDecodeAvgPower',
        compare: null,
        role: 'split',
      }).role,
    ).toBe('split');
  });
});

describe('resolvePowerXRole', () => {
  const stored = { metric: 'y_utilityModeledJPerTotalToken', compare: 'boundaries' } as const;

  it('pins Energy to GPU J per output token without touching the stored choice', () => {
    expect(resolvePowerXRole(stored, 'decode')).toEqual({
      metric: 'y_measuredJPerOutputToken',
      compare: 'roles',
    });
    // Back on All GPUs the stored facility + boundaries choice comes back as it was.
    expect(resolvePowerXRole(stored, 'all')).toBe(stored);
  });

  it('keeps Input for the prefill GPUs and drops it for decode', () => {
    const input = { metric: 'y_measuredJPerInputToken', compare: 'none' } as const;
    expect(resolvePowerXRole(input, 'prefill').metric).toBe('y_measuredJPerInputToken');
    expect(resolvePowerXRole(input, 'decode').metric).toBe('y_measuredJPerOutputToken');
  });

  it('forces the average on Power draw and leaves Where alone', () => {
    expect(resolvePowerXRole({ metric: 'y_measuredP90Power', compare: 'none' }, 'split')).toEqual({
      metric: 'y_measuredAvgPower',
      compare: 'roles',
    });
    const where = { metric: 'y_measuredAvgPower', compare: 'breakdown' } as const;
    expect(resolvePowerXRole(where, 'prefill')).toBe(where);
  });
});

describe('aggregated rows under a role', () => {
  const aggregated = { hwKey: 'h200_sglang', disagg: false };
  const base = { hwKey: 'gb200_dynamo', disagg: true, measuredDecodeAvgPower: { y: 800 } };
  const prefill = { ...base, powerVariant: { kind: 'role', id: 'prefill' } };
  const decode = { ...base, powerVariant: { kind: 'role', id: 'decode' } };
  const rows = [aggregated, base, prefill, decode];

  it('lists aggregated rows under every role instead of dropping them', () => {
    for (const role of ['prefill', 'decode', 'split'] as const) {
      expect(powerRoleTableRows(rows, role)).toContain(aggregated);
    }
  });

  it('lists each pool the role reads and never the all-GPU base of a split row', () => {
    expect(powerRoleTableRows(rows, 'decode')).toEqual([aggregated, decode]);
    expect(powerRoleTableRows(rows, 'split')).toEqual([aggregated, prefill, decode]);
    expect(powerRoleTableRows(rows, 'all')).toEqual([aggregated, base]);
  });

  it('hides the base line and the unread pool on the chart', () => {
    expect([...powerRoleHiddenVariants('prefill')].sort()).toEqual(['', 'all', 'decode']);
    expect(powerRoleHiddenVariants('all').size).toBe(0);
  });
});

describe('powerXRoleTitle', () => {
  it('puts the pool back in the role-free title, worded like the old role metrics', () => {
    expect(powerXRoleTitle('Measured Joules per Input Token', 'prefill', 'en')).toBe(
      'Measured Prefill Joules per Input Token',
    );
    expect(powerXRoleTitle('Measured J per Output Token (J/tok)', 'decode', 'en')).toBe(
      'Measured Decode J per Output Token (J/tok)',
    );
    expect(powerXRoleTitle('每输入 token 实测焦耳能耗', 'prefill', 'zh')).toBe(
      '每输入 token 实测 Prefill 焦耳能耗',
    );
    expect(powerXRoleTitle('Measured Joules per Output Token', 'split', 'en')).toBe(
      'Measured Prefill vs Decode Joules per Output Token',
    );
  });

  it('leaves All GPUs alone and prefixes a title without Measured', () => {
    expect(powerXRoleTitle('Measured Joules per Output Token', 'all', 'en')).toBe(
      'Measured Joules per Output Token',
    );
    expect(powerXRoleTitle('Throughput per GPU', 'decode', 'en')).toBe(
      'Decode · Throughput per GPU',
    );
  });
});
