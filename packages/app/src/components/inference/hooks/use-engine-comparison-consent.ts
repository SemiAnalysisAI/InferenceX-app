import { useCallback, useState } from 'react';

import { Sequence } from '@/lib/data-mappings';
import type { Exclusion } from '@/lib/exclusion';

export function supportsEngineComparisonConsent(sequence: Sequence): boolean {
  return sequence === Sequence.EightK_OneK || sequence === Sequence.AgenticTraces;
}

/** Only the same-SKU vLLM/SGLang rule is waivable, not global MTP rules. */
export function needsEngineComparisonConsent(
  keys: Iterable<string>,
  exclusion: Exclusion | null,
): boolean {
  if (!exclusion) return false;
  const familiesBySku = new Map<string, Set<string>>();
  for (const raw of keys) {
    const key = raw.replace(/^overlay:/u, '');
    const family = exclusion.familyOf(key);
    if (family !== 'vllm' && family !== 'sglang') continue;
    const sku = key.split('_')[0];
    const families = familiesBySku.get(sku) ?? new Set<string>();
    families.add(family);
    if (families.size === 2) return true;
    familiesBySku.set(sku, families);
  }
  return false;
}

/** Consent stays in memory, never in a share URL or browser storage. */
export function useEngineComparisonConsent(scope: string) {
  const [state, setState] = useState<{
    scope: string;
    accepted: boolean;
    pending: (() => void) | null;
  }>({ scope, accepted: false, pending: null });
  // Reset during render so a scope change cannot briefly render with old consent.
  if (state.scope !== scope) setState({ scope, accepted: false, pending: null });
  const accepted = state.scope === scope && state.accepted;
  const pending = state.scope === scope ? state.pending : null;

  const request = useCallback(
    (apply: () => void) => {
      setState({ scope, accepted: false, pending: apply });
    },
    [scope],
  );
  const cancel = useCallback(() => {
    setState((current) => ({ ...current, pending: null }));
  }, []);
  const confirm = useCallback(() => {
    if (!pending) return;
    setState({ scope, accepted: true, pending: null });
    pending();
  }, [scope, pending]);
  return { accepted, open: pending !== null, request, cancel, confirm };
}
