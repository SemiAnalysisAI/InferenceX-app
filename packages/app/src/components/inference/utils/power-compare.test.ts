import { describe, expect, it } from 'vitest';

import { COUNT_COMPARE_BASES, powerCompareVariants } from './power-compare';

const basisIds = (metric: string, bases?: readonly string[]) =>
  powerCompareVariants(metric, 'boundaries', bases as never).map((series) => series.variant.id);

describe('powerCompareVariants boundaries', () => {
  it('overlays every other boundary by default', () => {
    expect(basisIds('y_measuredJPerOutputToken').length).toBeGreaterThan(1);
  });

  it('limits the PowerX "Both" overlay to the whole-system boundary', () => {
    expect(basisIds('y_measuredJPerOutputToken', COUNT_COMPARE_BASES)).toEqual(['utility-modeled']);
    expect(basisIds('y_measuredAvgPower', COUNT_COMPARE_BASES)).toEqual(['utility-modeled']);
  });
});
