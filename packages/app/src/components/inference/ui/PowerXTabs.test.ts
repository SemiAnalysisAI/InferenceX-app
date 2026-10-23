import { describe, expect, it } from 'vitest';

import { energyPerFor, powerXTabFor } from './PowerXTabs';

describe('powerXTabFor', () => {
  it('maps every measured metric to a tab so the controls never disappear', () => {
    expect(powerXTabFor('y_measuredAvgPower', 'none')).toBe('draw');
    expect(powerXTabFor('y_measuredP90Power', 'none')).toBe('draw');
    expect(powerXTabFor('y_measuredPowerPercentTdp', 'none')).toBe('draw');
    expect(powerXTabFor('y_measuredWhPerSuccessfulQuery', 'none')).toBe('energy');
    expect(powerXTabFor('y_measuredPowerTimeline', 'none')).toBe('time');
    expect(powerXTabFor('y_notAPowerMetric', 'none')).toBeNull();
  });

  it('keeps an energy boundary overlay on the Energy tab and sends power splits to Where', () => {
    expect(powerXTabFor('y_measuredJPerOutputToken', 'boundaries')).toBe('energy');
    expect(powerXTabFor('y_measuredAvgPower', 'boundaries')).toBe('where');
    expect(powerXTabFor('y_measuredAvgPower', 'roles')).toBe('where');
  });
});

describe('energyPerFor', () => {
  it('reads the unit from the metric, whatever its boundary or role', () => {
    expect(energyPerFor('y_measuredJPerOutputToken')).toBe('output');
    expect(energyPerFor('y_utilityModeledJPerOutputToken')).toBe('output');
    expect(energyPerFor('y_measuredPrefillJPerInputToken')).toBe('input');
    expect(energyPerFor('y_measuredJPerTotalToken')).toBe('total');
    expect(energyPerFor('y_measuredJPerSuccessfulQuery')).toBe('query');
    expect(energyPerFor('y_measuredWhPerSuccessfulQuery')).toBe('query');
  });
});

describe('breakdown hatch angles', () => {
  it('gives every modeled part its own stripe angle, matched between SVG and CSS', async () => {
    const { HATCH_ANGLE, cssHatchAngle } = await import('./PowerBreakdownPanel');
    const modeled = ['server', 'fansPsu', 'network', 'facility'] as const;
    expect(new Set(modeled.map((category) => HATCH_ANGLE[category])).size).toBe(modeled.length);
    // A vertical SVG stripe rotated by a draws the same lines as a CSS gradient at a + 90.
    for (const category of modeled) {
      expect((cssHatchAngle(category) - HATCH_ANGLE[category] + 360) % 360).toBe(90);
    }
  });
});
