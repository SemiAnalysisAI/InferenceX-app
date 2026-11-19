import type { ReproducePayload } from '@/lib/reproduce/reproduce-payload';

import { useByIdQuery } from './benchmark-id-query';

export function useReproduce(id: number | null, enabled = false) {
  return useByIdQuery<ReproducePayload>('reproduce', id, enabled);
}
