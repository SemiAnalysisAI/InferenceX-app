import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type {
  AvailableQuickFilters,
  DeploymentMode,
  InferenceData,
  QuickFilters,
  SpecMode,
} from '@/components/inference/types';
import { frameworkFamily } from '@/lib/catalog/framework-family';
import type { PowerTier } from '@/lib/power/power-tier';
import { pointTopologyKey } from './topology-filter';

export type { AvailableQuickFilters, DeploymentMode, PowerTier, QuickFilters, SpecMode };

export const VENDOR_ORDER: readonly string[] = ['NVIDIA', 'AMD', 'OpenAI', 'Google'];

export const EMPTY_QUICK_FILTERS: QuickFilters = {
  vendors: [],
  frameworks: [],
  deployment: [],
  spec: [],
  power: [],
};

export const POWER_TIER_ORDER: readonly PowerTier[] = ['certified', 'legacy'];

export const FRAMEWORK_FAMILIES = [
  { key: 'vllm', label: 'vLLM' },
  { key: 'sglang', label: 'SGLang' },
  { key: 'trt', label: 'TRTLLM' },
  { key: 'atom', label: 'ATOM' },
] as const;

const FRAMEWORK_FAMILY_ORDER = FRAMEWORK_FAMILIES.map((f) => f.key);

export function computeAvailableQuickFilters(
  points: Iterable<InferenceData>,
): AvailableQuickFilters {
  const vendors = new Set<string>();
  const frameworks = new Set<string>();
  const topologies = new Set<string>();
  let hasSingleNode = false;
  let hasMultiNode = false;
  let hasDisagg = false;
  let hasMtp = false;
  let hasStp = false;
  let hasCertified = false;
  let hasLegacy = false;
  for (const p of points) {
    topologies.add(pointTopologyKey(p));
    const vendor = pointVendor(String(p.hwKey));
    if (vendor) vendors.add(vendor);
    const fam = frameworkFamily(p.framework);
    if (fam) frameworks.add(fam);
    const deployment = pointDeploymentMode(p);
    if (deployment === 'disagg') hasDisagg = true;
    else if (deployment === 'multi-node') hasMultiNode = true;
    else hasSingleNode = true;
    if (pointSpecMode(p) === 'mtp') hasMtp = true;
    else hasStp = true;
    if (p.power_tier === 'certified') hasCertified = true;
    else if (p.power_tier === 'legacy') hasLegacy = true;
  }
  const deployment: DeploymentMode[] = [];
  if (hasSingleNode) deployment.push('single-node');
  if (hasMultiNode) deployment.push('multi-node');
  if (hasDisagg) deployment.push('disagg');
  const spec: SpecMode[] = [];
  if (hasMtp) spec.push('mtp');
  if (hasStp) spec.push('stp');
  return {
    vendors: VENDOR_ORDER.filter((v) => vendors.has(v)),
    frameworks: FRAMEWORK_FAMILY_ORDER.filter((f) => frameworks.has(f)),
    deployment,
    spec,
    power: POWER_TIER_ORDER.filter((tier) => (tier === 'certified' ? hasCertified : hasLegacy)),
    topologies: [...topologies].toSorted(),
  };
}

export function quickFiltersActive(f: QuickFilters): boolean {
  return (
    f.vendors.length > 0 ||
    f.frameworks.length > 0 ||
    f.deployment.length > 0 ||
    f.spec.length > 0 ||
    f.power.length > 0 ||
    (f.topologies?.length ?? 0) > 0
  );
}

export function pointVendor(hwKey: string): string | undefined {
  return GPU_VENDORS[hwKey.split('_')[0]];
}

function pointSpecMode(point: InferenceData): SpecMode {
  const s = point.spec_decoding;
  const isStandard =
    (s === 'none' || s === '' || s === undefined || s === null) &&
    !String(point.hwKey).endsWith('_mtp');
  return isStandard ? 'stp' : 'mtp';
}

export function pointDeploymentMode(
  point: Pick<InferenceData, 'disagg' | 'is_multinode'>,
): DeploymentMode {
  if (point.disagg) return 'disagg';
  return point.is_multinode ? 'multi-node' : 'single-node';
}

export function parseDeploymentModes(values: readonly string[]): DeploymentMode[] {
  return [
    ...new Set(values.flatMap((mode) => (mode === 'agg' ? ['single-node', 'multi-node'] : [mode]))),
  ].filter(
    (mode): mode is DeploymentMode =>
      mode === 'single-node' || mode === 'multi-node' || mode === 'disagg',
  );
}

export function parsePowerTiers(values: readonly string[]): PowerTier[] {
  return [...new Set(values)].filter(
    (tier): tier is PowerTier => tier === 'certified' || tier === 'legacy',
  );
}

export function matchesQuickFilters(point: InferenceData, f: QuickFilters): boolean {
  if (f.topologies?.length && !f.topologies.includes(pointTopologyKey(point))) return false;
  if (f.vendors.length > 0) {
    const vendor = pointVendor(String(point.hwKey));
    if (!vendor || !f.vendors.includes(vendor)) return false;
  }
  if (f.frameworks.length > 0) {
    const fam = frameworkFamily(point.framework);
    if (!fam || !f.frameworks.includes(fam)) return false;
  }
  if (f.deployment.length > 0 && !f.deployment.includes(pointDeploymentMode(point))) return false;
  if (f.spec.length > 0 && !f.spec.includes(pointSpecMode(point))) return false;
  if (f.power.length > 0) {
    const tier = point.power_tier;
    if (!tier || !f.power.includes(tier)) return false;
  }
  return true;
}

export function applyQuickFilters<T extends InferenceData>(data: T[], f: QuickFilters): T[] {
  if (!quickFiltersActive(f)) return data;
  return data.filter((d) => matchesQuickFilters(d, f));
}
