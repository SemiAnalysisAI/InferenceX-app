import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type { CostTier } from '@/components/inference/metric-registry';
import { getGpuSpecs, type TcoBasis } from '@/lib/catalog/constants';

export function publishedCostsForTier(tier: CostTier, tcoBasis: TcoBasis): Record<string, number> {
  const field = tier === 'rental' ? 'costr' : 'costh';
  return Object.fromEntries(
    Object.keys(HW_REGISTRY).map((base) => [base, getGpuSpecs(base, tcoBasis)[field]]),
  );
}
