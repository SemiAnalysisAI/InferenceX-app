/**
 * The system power model's revision and the parts its estimates are split into. Charts, tooltips
 * and docs import these without loading the model itself (`system-power-model.ts`), which the
 * inference chart loads on its own after the page's first JavaScript.
 */
import type { Locale } from '@/lib/i18n/i18n';

import manifest from './power-model.manifest.json';

export const SYSTEM_POWER_MODEL_REVISION = manifest.modelRevision;
export const SYSTEM_POWER_MODEL_SOURCE_URL = manifest.sourceUrl;

/**
 * Where a modeled unit's watts go, one part per component class in the stack
 * order PowerX draws them (bottom up): measured GPU boards, measured Grace
 * sockets (NVL72 rows with same-window CPU telemetry), then the modeled host
 * CPUs, memory, NICs, NVSwitch, storage, the small PCIe parts, fans, power
 * conversion loss, the scale-out network share, and the facility overhead PUE
 * adds. The parts sum to `facilityWatts`; every part but `facility` sums to
 * `itWatts`.
 */
export const SYSTEM_POWER_CATEGORIES = [
  'gpu',
  'measuredCpu',
  'cpu',
  'memory',
  'nic',
  'nvswitch',
  'storage',
  'other',
  'fans',
  'psuLoss',
  'network',
  'facility',
] as const;
export type SystemPowerCategory = (typeof SYSTEM_POWER_CATEGORIES)[number];
export type SystemPowerBreakdown = Record<SystemPowerCategory, number>;

export const SYSTEM_POWER_CATEGORY_LABELS: Record<Locale, Record<SystemPowerCategory, string>> = {
  en: {
    gpu: 'GPU',
    measuredCpu: 'Grace CPU',
    cpu: 'CPU',
    memory: 'Memory',
    nic: 'NICs',
    nvswitch: 'NVSwitch',
    storage: 'Storage',
    other: 'PCIe & misc',
    fans: 'Fans',
    psuLoss: 'PSU loss',
    network: 'Network share',
    facility: 'Facility (PUE)',
  },
  zh: {
    gpu: 'GPU',
    measuredCpu: 'Grace CPU',
    cpu: 'CPU',
    memory: '内存',
    nic: '网卡',
    nvswitch: 'NVSwitch',
    storage: '存储',
    other: 'PCIe 及其他',
    fans: '风扇',
    psuLoss: '电源损耗',
    network: '网络分摊',
    facility: '机房开销（PUE）',
  },
};

/** The parts read from telemetry; every other part is the model's estimate. */
export const MEASURED_SYSTEM_POWER_CATEGORIES: ReadonlySet<SystemPowerCategory> = new Set([
  'gpu',
  'measuredCpu',
]);

export const emptySystemPowerBreakdown = (): SystemPowerBreakdown => ({
  gpu: 0,
  measuredCpu: 0,
  cpu: 0,
  memory: 0,
  nic: 0,
  nvswitch: 0,
  storage: 0,
  other: 0,
  fans: 0,
  psuLoss: 0,
  network: 0,
  facility: 0,
});

export const scaleSystemPowerBreakdown = (
  breakdown: SystemPowerBreakdown,
  factor: number,
): SystemPowerBreakdown => {
  const scaled = emptySystemPowerBreakdown();
  for (const key of SYSTEM_POWER_CATEGORIES) scaled[key] = breakdown[key] * factor;
  return scaled;
};
