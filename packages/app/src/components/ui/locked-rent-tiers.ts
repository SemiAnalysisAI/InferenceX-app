import type { Locale } from '@/lib/i18n';

/**
 * Rental pricing tiers that InferenceX does not publish. The public
 * dashboards carry two TCO tiers (Owning at Large Hyperscaler Volume and
 * Rent - 3 Year Commit); the shorter-commit rental rates live in the
 * SemiAnalysis AI Cloud TCO Model. These entries render as locked options in
 * the y-axis and Cost Provider selectors, and picking one opens the TCO
 * model dialog instead of changing the chart.
 */
export type LockedRentTierId =
  | 'rent_on_demand'
  | 'rent_1_month'
  | 'rent_6_month'
  | 'rent_1_year'
  | 'rent_2_year';

export interface LockedRentTier {
  id: LockedRentTierId;
  label: string;
  labelZh: string;
}

/** Ordered by commitment length so the selector reads as a pricing ladder. */
export const LOCKED_RENT_TIERS: readonly LockedRentTier[] = [
  { id: 'rent_on_demand', label: 'Rent - On Demand', labelZh: '租赁 - 按需' },
  { id: 'rent_1_month', label: 'Rent - 1 Month Commit', labelZh: '租赁 - 1 个月承诺' },
  { id: 'rent_6_month', label: 'Rent - 6 Month Commit', labelZh: '租赁 - 6 个月承诺' },
  { id: 'rent_1_year', label: 'Rent - 1 Year Commit', labelZh: '租赁 - 1 年承诺' },
  { id: 'rent_2_year', label: 'Rent - 2 Year Commit', labelZh: '租赁 - 2 年承诺' },
];

const LOCKED_TIER_BY_ID = new Map<string, LockedRentTier>(
  LOCKED_RENT_TIERS.map((tier) => [tier.id, tier]),
);

/**
 * Selector values for locked tiers carry this prefix so a handler can tell
 * them apart from real metric keys / cost providers before touching state.
 */
export const LOCKED_TIER_VALUE_PREFIX = 'locked:';

export function lockedTierValue(id: LockedRentTierId, suffix?: string): string {
  return suffix ? `${LOCKED_TIER_VALUE_PREFIX}${id}:${suffix}` : `${LOCKED_TIER_VALUE_PREFIX}${id}`;
}

/** Resolves a selector value back to its locked tier, or null for real options. */
export function parseLockedTierValue(value: string): LockedRentTier | null {
  if (!value.startsWith(LOCKED_TIER_VALUE_PREFIX)) return null;
  const id = value.slice(LOCKED_TIER_VALUE_PREFIX.length).split(':')[0] ?? '';
  return LOCKED_TIER_BY_ID.get(id) ?? null;
}

export function lockedTierLabel(tier: LockedRentTier, locale: Locale): string {
  return locale === 'zh' ? tier.labelZh : tier.label;
}
