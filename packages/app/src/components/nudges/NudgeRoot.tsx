'use client';

import { Nudge } from './Nudge';
import { NUDGE_REGISTRY } from './registry';

/**
 * Floating-nudge mount point. Renders every modal- and toast-kind entry in the
 * registry; each Nudge filters itself by route. Banners render inline via
 * `<NudgeBannerSlot />` instead. Wrap the app in `<NudgeProvider>` once, then
 * place this near the top of the layout tree.
 */
export function NudgeRoot() {
  return (
    <>
      {NUDGE_REGISTRY.filter((e) => e.kind !== 'banner').map((entry) => (
        <Nudge key={entry.id} entry={entry} />
      ))}
    </>
  );
}
