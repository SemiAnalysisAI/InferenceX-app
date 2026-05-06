'use client';

import { Nudge } from './Nudge';
import { NUDGE_REGISTRY } from './registry';

/**
 * Inline banner mount point. Drop this anywhere in a page layout and any
 * registry entry whose `kind === 'banner'` and whose `routes` match the current
 * pathname will render here. Wrap somewhere in the tree with `<NudgeProvider>`
 * (already done in the root layout).
 */
export function NudgeBannerSlot() {
  return (
    <>
      {NUDGE_REGISTRY.filter((e) => e.kind === 'banner').map((entry) => (
        <Nudge key={entry.id} entry={entry} />
      ))}
    </>
  );
}
