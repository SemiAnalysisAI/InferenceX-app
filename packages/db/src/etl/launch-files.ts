// Dependency-free so the log viewer can import it into the browser bundle.

// Files srtctl and the engines write that record how a point was launched: the resolved
// recipe, each worker's environment fingerprint, engine config files, and the client command.
const LAUNCH_FILE =
  /^(?:recipe\.lock\.yaml|config\.yaml|fingerprint_.+\.json|trtllm_config_.+\.yaml|.+_config\.json|benchmark_command\.txt)$/u;

/** Launch-provenance files kept beside a point's logs. Only the base name of `fileName` counts. */
export function isLaunchFileName(fileName: string): boolean {
  return LAUNCH_FILE.test(fileName.slice(fileName.lastIndexOf('/') + 1).toLowerCase());
}
