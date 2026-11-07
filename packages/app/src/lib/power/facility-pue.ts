import type { Locale } from '@/lib/i18n/i18n';

import { CoolingProfile } from './power_model/cooling';

export const AIR_COOLED_SYSTEM_PUE = new CoolingProfile({ mode: 'air' }).pue;
export const LIQUID_COOLED_RACK_PUE = new CoolingProfile({ mode: 'liquid' }).pue;

export const FACILITY_PUE_NOTE: Record<Locale, string> = {
  en: `Facility = measured IT power × assumed PUE (${AIR_COOLED_SYSTEM_PUE} air-cooled, ${LIQUID_COOLED_RACK_PUE} liquid-cooled).`,
  zh: `数据中心功耗 = 实测 IT 功耗 × 假定 PUE（风冷 ${AIR_COOLED_SYSTEM_PUE}，液冷 ${LIQUID_COOLED_RACK_PUE}）。`,
};

export const formatPueRange = (pues: readonly number[]): string => {
  const finite = pues.filter((pue) => Number.isFinite(pue));
  if (finite.length === 0) return '—';
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  return low === high ? String(low) : `${low}–${high}`;
};
