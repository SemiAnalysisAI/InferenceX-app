export interface KvOffloadState {
  kv_offloading?: string | null;
  offload_mode?: string | null;
}

export function isKvOffloadEnabled(state: KvOffloadState): boolean {
  const descriptor = state.kv_offloading?.trim().toLowerCase();
  if (descriptor) return descriptor !== 'none';
  return state.offload_mode?.trim().toLowerCase() === 'on';
}
