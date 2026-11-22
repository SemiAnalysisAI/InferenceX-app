import { describe, expect, it, mock } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';

mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

import { defaultReadoutPoint } from './PowerXLayout';

const metric = (y: number) => ({ y, roof: false });
function readoutPoint(x: number, overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    hwKey: 'b200_vllm',
    model: 'dsv4pro',
    precision: 'fp4',
    conc: 64,
    x,
    y: 10,
    date: '2026-10-23',
    measuredAvgPower: metric(700),
    itModeledWatts: metric(1000),
    utilityModeledWatts: metric(1300),
    modeledSystemPower: { status: 'supported', pue: 1.3 } as InferenceData['modeledSystemPower'],
    ...overrides,
  } as InferenceData;
}

describe('defaultReadoutPoint', () => {
  it('picks the point nearest 80 tok/s/user', () => {
    const points = [readoutPoint(20), readoutPoint(75), readoutPoint(300)];
    expect(defaultReadoutPoint(points)).toBe(points[1]);
  });

  it('prefers a point with an IT model over a nearer one without', () => {
    const unmodeled = readoutPoint(80, {
      itModeledWatts: undefined,
      utilityModeledWatts: undefined,
      modeledSystemPower: undefined,
    });
    const modeled = readoutPoint(10);
    expect(defaultReadoutPoint([unmodeled, modeled])).toBe(modeled);
    expect(defaultReadoutPoint([])).toBeNull();
  });
});
