import { describe, expect, it } from 'bun:test';

import {
  powerRoleTableRows,
  powerXRoleTitle,
  resolvePowerXRole,
  rewriteLegacyPowerRoleParams,
} from './powerx-role';

describe('rewriteLegacyPowerRoleParams', () => {
  it.each([
    ['y_measuredPrefillAvgPower', null, null, 'y_measuredAvgPower', null, 'prefill'],
    ['y_measuredDecodeAvgPower', null, null, 'y_measuredAvgPower', null, 'decode'],
    ['y_measuredPrefillJPerInputToken', null, null, 'y_measuredJPerInputToken', null, 'prefill'],
    ['y_measuredDecodeJPerOutputToken', null, null, 'y_measuredJPerOutputToken', null, 'decode'],
    ['y_measuredAvgPower', 'roles', null, 'y_measuredAvgPower', 'breakdown', 'split'],
    // An explicit i_role wins over the role an old metric implied.
    ['y_measuredDecodeAvgPower', null, 'split', 'y_measuredAvgPower', null, 'split'],
  ])('rewrites %s / %s / %s onto i_role', (metric, compare, role, ...next) => {
    const params = rewriteLegacyPowerRoleParams({ metric, compare, role });
    expect([params.metric, params.compare, params.role]).toEqual(next);
  });
});

const pinned = (metric: string) => ({ metric, compare: 'roles' });

describe('resolvePowerXRole', () => {
  const stored = { metric: 'y_utilityModeledJPerTotalToken', compare: 'boundaries' } as const;
  const input = { metric: 'y_measuredJPerInputToken', compare: 'none' } as const;
  const p90 = { metric: 'y_measuredP90Power', compare: 'none' } as const;
  const tdp = { metric: 'y_measuredPowerPercentTdp', compare: 'none' } as const;
  const where = { metric: 'y_measuredAvgPower', compare: 'breakdown' } as const;

  it.each([
    // Energy: GPU-only J per output token; All GPUs returns the stored choice as it was.
    ['Energy', 'decode', stored, pinned('y_measuredJPerOutputToken')],
    ['Energy', 'all', stored, stored],
    // Input stays for the prefill GPUs only.
    ['Energy per input', 'prefill', input, pinned('y_measuredJPerInputToken')],
    ['Energy per input', 'decode', input, pinned('y_measuredJPerOutputToken')],
    // Power draw: percentiles need the whole fleet, so P90 falls back to the average.
    ['P90 draw', 'split', p90, pinned('y_measuredAvgPower')],
    ['% of TDP', 'decode', tdp, pinned('y_measuredPowerPercentTdp')],
    ['Where', 'prefill', where, where],
  ] as const)('pins %s under %s', (_view, role, selection, expected) => {
    expect(resolvePowerXRole(selection, role)).toEqual(expected);
  });
});

describe('powerRoleTableRows', () => {
  const aggregated = { hwKey: 'h200_sglang', disagg: false };
  const base = { hwKey: 'gb200_dynamo', disagg: true, measuredDecodeAvgPower: { y: 800 } };
  const prefill = { ...base, powerVariant: { kind: 'role', id: 'prefill' } };
  const decode = { ...base, powerVariant: { kind: 'role', id: 'decode' } };
  const rows = [aggregated, base, prefill, decode];

  it('lists each pool the role reads and aggregated rows once, never the base of a split row', () => {
    expect(powerRoleTableRows(rows, 'decode')).toEqual([aggregated, decode]);
    expect(powerRoleTableRows(rows, 'split')).toEqual([aggregated, prefill, decode]);
    expect(powerRoleTableRows(rows, 'all')).toEqual([aggregated, base]);
  });
});

describe('powerXRoleTitle', () => {
  it('puts the pool in the title after Measured, prefixes it otherwise, and leaves All alone', () => {
    expect(powerXRoleTitle('Measured J per Output Token (J/tok)', 'decode', 'en')).toBe(
      'Measured Decode J per Output Token (J/tok)',
    );
    expect(powerXRoleTitle('每输入 token 实测焦耳能耗', 'prefill', 'zh')).toBe(
      '每输入 token 实测 Prefill 焦耳能耗',
    );
    expect(powerXRoleTitle('Measured Joules per Output Token', 'split', 'en')).toBe(
      'Measured Prefill vs Decode Joules per Output Token',
    );
    expect(powerXRoleTitle('Throughput per GPU', 'decode', 'en')).toBe(
      'Decode · Throughput per GPU',
    );
    expect(powerXRoleTitle('Measured Joules per Output Token', 'all', 'en')).toBe(
      'Measured Joules per Output Token',
    );
  });
});
