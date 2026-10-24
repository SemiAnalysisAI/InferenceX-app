import { describe, expect, it } from 'vitest';

import { powerCompareAvailable, powerCompareVariants } from './power-compare';

describe('power comparison on J per total token', () => {
  it('adds the other three boundaries as siblings', () => {
    expect(powerCompareVariants('y_measuredJPerTotalToken', 'boundaries')).toEqual([
      { variant: { kind: 'basis', id: 'gpu-provisioned' }, field: 'gpuProvisionedJPerTotalToken' },
      {
        variant: { kind: 'basis', id: 'utility-provisioned' },
        field: 'utilityProvisionedJPerTotalToken',
      },
      { variant: { kind: 'basis', id: 'utility-modeled' }, field: 'utilityModeledJPerTotalToken' },
    ]);
    expect(
      powerCompareVariants('y_utilityModeledJPerTotalToken', 'boundaries').map(
        ({ field }) => field,
      ),
    ).toEqual([
      'measuredJPerTotalToken',
      'gpuProvisionedJPerTotalToken',
      'utilityProvisionedJPerTotalToken',
    ]);
  });

  it('offers no role comparison, which is defined on output tokens only', () => {
    expect(powerCompareVariants('y_measuredJPerTotalToken', 'roles')).toEqual([]);
    expect(powerCompareAvailable('y_measuredJPerTotalToken', 'roles')).toBe(false);
  });
});
