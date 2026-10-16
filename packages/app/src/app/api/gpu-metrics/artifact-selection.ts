/** Artifact identity rules shared by stored selection and the live GitHub listing. */
export const ARTIFACT_PREFIX = 'gpu_metrics_';
const BUNDLE_PREFIX = 'power_audit_';

/**
 * A bundle names a whole sweep, while the client's prefix (the longest common
 * prefix of its points' validation names) may run into the `_sa-bench_…_conc<c>`
 * suffix; either side being a prefix of the other selects the bundle.
 */
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
