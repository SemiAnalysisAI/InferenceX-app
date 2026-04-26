export const MTP_ENGINE_CONFLICT_EVENT = 'inferencex:mtp-engine-conflict';

export interface MtpEngineConflictDetail {
  /** Engine family the user attempted to add (vllm, sglang, ...). Null for
   * non-toggle paths like select-all where there's no single attempted key. */
  attempted: string | null;
  /** Engine family that remains visible (or null when none). */
  existing: string | null;
}

export function dispatchMtpEngineConflict(detail: MtpEngineConflictDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MTP_ENGINE_CONFLICT_EVENT, { detail }));
}
