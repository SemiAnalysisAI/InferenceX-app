import type { Locale } from '@/lib/i18n/i18n';

// Copy and labels quote the upstream cooling PUEs without loading the power model class graph.
// system-power-model.test.ts pins both values to SYSTEMS.
export const AIR_COOLED_SYSTEM_PUE = 1.3;
export const LIQUID_COOLED_RACK_PUE = 1.1;

/** What every facility figure is: the measured IT boundary times one assumed PUE. */
export const FACILITY_PUE_NOTE: Record<Locale, string> = {
  en: `Facility = measured IT power × assumed PUE (${AIR_COOLED_SYSTEM_PUE} air-cooled, ${LIQUID_COOLED_RACK_PUE} liquid-cooled).`,
  zh: `数据中心功耗 = 实测 IT 功耗 × 假定 PUE（风冷 ${AIR_COOLED_SYSTEM_PUE}，液冷 ${LIQUID_COOLED_RACK_PUE}）。`,
};

/** The PUE label for a set of systems: one value, a `min–max` range, or `—` when none. */
export const formatPueRange = (pues: readonly number[]): string => {
  const finite = pues.filter((pue) => Number.isFinite(pue));
  if (finite.length === 0) return '—';
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  return low === high ? String(low) : `${low}–${high}`;
};
