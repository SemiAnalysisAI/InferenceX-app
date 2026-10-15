/** Runtime fields that describe whether KV cache offloading is enabled. */
export interface KvOffloadState {
  /** Canonical offload tier/type, for example `dram` or `none`. */
  kv_offloading?: string | null;
  /** Legacy binary fallback used by older agentic rows. */
  offload_mode?: string | null;
}

/**
 * Resolve the canonical KV-offload state used by cache-related UI.
 *
 * Current rows describe the tier (`none` means disabled; any other non-empty
 * descriptor means enabled). Historical rows only carry `offload_mode`, so
 * retain that as a fallback without allowing it to override current metadata.
 */
export function isKvOffloadEnabled(state: KvOffloadState): boolean {
  const descriptor = state.kv_offloading?.trim().toLowerCase();
  if (descriptor) return descriptor !== 'none';
  return state.offload_mode?.trim().toLowerCase() === 'on';
}
