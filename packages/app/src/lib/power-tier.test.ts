import { describe, expect, it } from 'vitest';

import { resolvePowerTier, type PowerTier } from './power-tier';

describe('resolvePowerTier', () => {
  const cases: {
    name: string;
    powerValid: number | undefined;
    wholeDeploymentSemantics: boolean;
    hasMeasuredTelemetry: boolean;
    expected: PowerTier | undefined;
  }[] = [
    {
      name: 'certified for a validated row with whole-deployment semantics',
      powerValid: 1,
      wholeDeploymentSemantics: true,
      hasMeasuredTelemetry: true,
      expected: 'certified',
    },
    {
      name: 'legacy for telemetry without a producer verdict',
      powerValid: undefined,
      wholeDeploymentSemantics: true,
      hasMeasuredTelemetry: true,
      expected: 'legacy',
    },
    {
      name: 'legacy for a validated disagg row without schema v2 semantics',
      powerValid: 1,
      wholeDeploymentSemantics: false,
      hasMeasuredTelemetry: true,
      expected: 'legacy',
    },
    {
      name: 'absent for an explicit invalid verdict (telemetry scrubbed upstream)',
      powerValid: 0,
      wholeDeploymentSemantics: true,
      hasMeasuredTelemetry: false,
      expected: undefined,
    },
    {
      // Defensive: even if a caller passed surviving telemetry with pv=0,
      // the explicit verdict stays authoritative.
      name: 'absent for an explicit invalid verdict regardless of telemetry',
      powerValid: 0,
      wholeDeploymentSemantics: true,
      hasMeasuredTelemetry: true,
      expected: undefined,
    },
    {
      name: 'absent when the row carries no measured telemetry',
      powerValid: undefined,
      wholeDeploymentSemantics: true,
      hasMeasuredTelemetry: false,
      expected: undefined,
    },
    {
      name: 'absent for a validated row whose telemetry fields are all missing',
      powerValid: 1,
      wholeDeploymentSemantics: true,
      hasMeasuredTelemetry: false,
      expected: undefined,
    },
  ];

  for (const { name, expected, ...args } of cases) {
    it(name, () => {
      expect(resolvePowerTier(args)).toBe(expected);
    });
  }
});
