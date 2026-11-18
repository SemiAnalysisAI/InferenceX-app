import { describe, expect, it } from 'vitest';

import type { AvailabilityIndex, AvailabilityLine } from '@/lib/benchmarks/availability-index';

import { modelsWithRoleData } from './powerx-role-availability';

const line = (model: string, overrides: Partial<AvailabilityLine> = {}) =>
  ({
    model,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: 'gb300',
    framework: 'dynamo-sglang',
    spec_method: 'none',
    disagg: true,
    benchmark_type: 'agentic_traces',
    sequence: 'agentic-traces',
    hwKey: 'gb300_dynamo-sglang',
    dates: new Uint32Array(1),
    ...overrides,
  }) as AvailabilityLine;

function index(lines: AvailabilityLine[]): AvailabilityIndex {
  const linesByModel = new Map<string, AvailabilityLine[]>();
  for (const l of lines) linesByModel.set(l.model, [...(linesByModel.get(l.model) ?? []), l]);
  return { dates: [], lines, linesByModel };
}

const scenario = { sequence: 'agentic-traces', precisions: ['fp4'] };

describe('modelsWithRoleData', () => {
  it('maps a display model through every DB key it covers', () => {
    // Kimi-K2.5 covers kimik2.5, kimik2.6 and kimik2.7-code; only the last is disaggregated.
    const availability = index([
      line('kimik2.5', { disagg: false }),
      line('kimik2.7-code'),
      line('kimik3.1', { disagg: false }),
    ]);
    expect(modelsWithRoleData(availability, scenario, ['Kimi-K3.1-Pro', 'Kimi-K2.5'])).toEqual([
      'Kimi-K2.5',
    ]);
  });

  it('ignores disaggregated lines from another sequence or precision', () => {
    const availability = index([
      line('kimik3.1', { sequence: '8k/1k' }),
      line('kimik3.1', { precision: 'fp8' }),
    ]);
    expect(modelsWithRoleData(availability, scenario, ['Kimi-K3.1-Pro'])).toEqual([]);
    expect(
      modelsWithRoleData(availability, { ...scenario, precisions: ['fp4', 'fp8'] }, [
        'Kimi-K3.1-Pro',
      ]),
    ).toEqual(['Kimi-K3.1-Pro']);
  });

  it('returns nothing before availability loads', () => {
    expect(modelsWithRoleData(undefined, scenario, ['Kimi-K3.1-Pro'])).toEqual([]);
  });
});
