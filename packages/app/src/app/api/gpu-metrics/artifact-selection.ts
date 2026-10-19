export const ARTIFACT_PREFIX = 'gpu_metrics_';
export const BUNDLE_PREFIX = 'power_audit_';

export function isWantedBundle(name: string, prefix: string | null): boolean {
  if (!name.startsWith(BUNDLE_PREFIX)) return false;
  if (prefix === null) return true;
  const wanted = `${BUNDLE_PREFIX}${prefix}`;
  return name.startsWith(wanted) || wanted.startsWith(name);
}

export function isRequestedArtifact(name: string, sources: string[] | null): boolean {
  return (
    sources === null ||
    sources.some((source) => {
      const result = source.slice('power_validation_'.length, -'.json'.length);
      return name === `${ARTIFACT_PREFIX}${result}` || isWantedBundle(name, result);
    })
  );
}
