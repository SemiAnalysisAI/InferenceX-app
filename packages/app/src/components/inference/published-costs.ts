import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type { CostTier } from '@/components/inference/metric-registry';
import { getGpuSpecs, type TcoBasis } from '@/lib/constants';

/**
 * The published $/chip/hr of every registry GPU on `tier`. Custom User Values
 * has no published price of its own, so it takes the Owning at Large
 * Hyperscaler Volume price as its seed.
 *
 * Both entry points into Custom User Values (the caption's Cost Tier selector
 * and the first keystroke into a TCO badge) seed the reader's costs from
 * here, so a chip that is hidden from the caption or added to the registry
 * later still has a price once the reader is on the custom tier.
 */
export function publishedCostsForTier(tier: CostTier, tcoBasis: TcoBasis): Record<string, number> {
  const field = tier === 'rental' ? 'costr' : 'costh';
  return Object.fromEntries(
    Object.keys(HW_REGISTRY).map((base) => [base, getGpuSpecs(base, tcoBasis)[field]]),
  );
}
