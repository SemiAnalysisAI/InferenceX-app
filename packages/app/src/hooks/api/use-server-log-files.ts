import { useByIdQuery } from './benchmark-id-query';

/** Artifact-relative .log/.out filenames available for one benchmark point. */
export function useServerLogFiles(id: number | null, enabled = false) {
  return useByIdQuery<string[]>('server-log-files', id, enabled);
}
