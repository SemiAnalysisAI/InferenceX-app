import { useByIdQuery } from './benchmark-id-query';

export function useServerLogFiles(id: number | null, enabled = false) {
  return useByIdQuery<string[]>('server-log-files', id, enabled);
}
