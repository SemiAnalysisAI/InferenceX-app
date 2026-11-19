export type PowerTier = 'certified' | 'legacy';

export function resolvePowerTier(args: {
  powerValid: number | undefined;
  wholeDeploymentSemantics: boolean;
  hasMeasuredTelemetry: boolean;
}): PowerTier | undefined {
  if (!args.hasMeasuredTelemetry || args.powerValid === 0) return undefined;
  return args.powerValid === 1 && args.wholeDeploymentSemantics ? 'certified' : 'legacy';
}
