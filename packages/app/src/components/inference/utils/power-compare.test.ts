import { describe, expect, it } from 'vitest';

import { powerCompareVariants } from './power-compare';

const ids = (metric: string, mode: 'boundaries' | 'all') =>
  powerCompareVariants(metric, mode).map((series) => series.variant.id);

describe('powerCompareVariants boundaries', () => {
  it('pairs GPU only with Whole system for the boundary compare', () => {
    expect(ids('y_measuredJPerOutputToken', 'boundaries')).toEqual(['utility-modeled']);
    expect(ids('y_measuredAvgPower', 'boundaries')).toEqual(['utility-modeled']);
  });

  it('adds the rated provisioned bounds when comparing all boundaries', () => {
    const all = ids('y_measuredJPerOutputToken', 'all');
    expect(all).toEqual(
      expect.arrayContaining(['utility-modeled', 'gpu-provisioned', 'utility-provisioned']),
    );
    expect(all.length).toBeGreaterThan(ids('y_measuredJPerOutputToken', 'boundaries').length);
  });
});
