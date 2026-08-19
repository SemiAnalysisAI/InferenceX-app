import { describe, expect, it } from 'vitest';

import { p50Interactivity } from './interactivity-metrics';

describe('p50Interactivity', () => {
  it('uses median TPOT instead of canonical full-response interactivity for AgentX rows', () => {
    expect(
      p50Interactivity({
        median_tpot: 0.00245,
        median_tpot_intvty: 407.50337,
        median_intvty: 1315.8,
      }),
    ).toBeCloseTo(407.50337, 5);
  });

  it('uses the same P50 metric for unofficial-run overlay data', () => {
    expect(
      p50Interactivity({
        median_tpot: 0.00245,
        median_tpot_intvty: 407.50337,
        median_intvty: 1312.6527,
      }),
    ).toBeCloseTo(407.50337, 5);
  });

  it('falls back to stored median interactivity when median TPOT is unavailable', () => {
    expect(p50Interactivity({ median_tpot: 0, median_intvty: 52.4 })).toBe(52.4);
  });

  it('returns zero for invalid TPOT and interactivity values', () => {
    expect(p50Interactivity({ median_tpot: Number.NaN, median_intvty: -1 })).toBe(0);
  });
});
