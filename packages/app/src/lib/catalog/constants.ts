import { HW_REGISTRY, resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import { DEPLOYMENT_FLAGS } from '@/lib/config/deployment-flags';

export const TABLEAU_10 = [
  '#4e79a7',
  '#f28e2c',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
] as const;

export interface GpuSpecs {
  tdp: number;
  power: number;
  costh: number;
  costr: number;
}

export type TcoBasis = 'external' | 'internal';

export const DEFAULT_TCO_BASIS: TcoBasis = DEPLOYMENT_FLAGS.defaultTcoBasis;

const DEFAULT_SPECS: GpuSpecs = { tdp: 0, power: 0, costh: 0, costr: 0 };

export function getGpuSpecs(hwKey: string, basis: TcoBasis = DEFAULT_TCO_BASIS): GpuSpecs {
  const base = hwKey.split(/[-_]/u)[0];
  const entry = HW_REGISTRY[base];
  if (!entry) return DEFAULT_SPECS;
  const internalCost = base === 'tpuv7' ? 1.03 : undefined;
  return {
    tdp: entry.tdp,
    power: entry.power,
    costh: basis === 'internal' ? (internalCost ?? entry.costh) : entry.costh,
    costr: entry.costr,
  };
}

function getVendorPrefix(base: string): string {
  const entry = HW_REGISTRY[base];
  if (!entry) return 'Unknown';
  return `${entry.vendor} '${entry.arch}'`;
}

export interface HardwareEntry {
  name: string;
  label: string;
  suffix: string;
  gpu: string;
  framework?: string;
  alwaysShowPrecision?: boolean;
}

const UNKNOWN_HARDWARE: HardwareEntry = {
  name: 'unknown',
  label: 'Unknown',
  suffix: '',
  gpu: 'Unknown Hardware',
};

function buildHardwareEntry(hwKey: string, model?: string): HardwareEntry | null {
  const base = hwKey.split('_')[0];
  const reg = HW_REGISTRY[base];
  if (!reg) return null;

  const parts = hwKey.split('_').slice(1);
  const label = reg.label;
  const gpuName = base.toUpperCase();
  const isJulyRubinSnapshot = base === 'vr200' && parts[0] === 'rubin-july';
  const partLabels =
    base === 'vr200' && parts[0] === 'coreweave-vera-rubin'
      ? parts.slice(1).map((p) => resolveFrameworkPartLabel(model, p))
      : parts.map((p) => resolveFrameworkPartLabel(model, p));

  return {
    name: hwKey.replaceAll('_', '-'),
    label,
    suffix: partLabels.length > 0 ? `(${partLabels.join(', ')})` : '',
    gpu: [getVendorPrefix(base), gpuName, ...partLabels].join(' '),
    ...(isJulyRubinSnapshot ? { alwaysShowPrecision: true } : {}),
  };
}

export const GPU_KEY_ALIASES: Record<string, string[]> = {
  'gb200_dynamo-trt': ['gb200_dynamo-trtllm'],
  'gb200_dynamo-trt_mtp': ['gb200_dynamo-trtllm_mtp'],
  'gb300_dynamo-trt': ['gb300_dynamo-trtllm'],
  'gb300_dynamo-trt_mtp': ['gb300_dynamo-trtllm_mtp'],
};

export const GPU_ALIAS_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(GPU_KEY_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical]),
  ),
);
export function getModelSortIndex(hwKey: string): number {
  const base = hwKey.split('_')[0];
  const entry = HW_REGISTRY[base];
  return entry?.sort ?? Object.keys(HW_REGISTRY).length;
}

export function isKnownGpu(hwKey: string): boolean {
  return hwKey.split('_')[0] in HW_REGISTRY;
}

export function hardwareKeyMatchesBase(hwKey: string, baseGpuKey: string): boolean {
  return hwKey === baseGpuKey || hwKey.startsWith(`${baseGpuKey}_`);
}

export function hardwareKeyMatchesAnyBase(hwKey: string, baseGpuKeys: readonly string[]): boolean {
  return baseGpuKeys.some((b) => hardwareKeyMatchesBase(hwKey, b));
}

const hwCache = new Map<string, HardwareEntry>();

export function getHardwareConfig(hwKey: string, model?: string): HardwareEntry {
  const cacheKey = model ? `${model}|${hwKey}` : hwKey;
  const cached = hwCache.get(cacheKey);
  if (cached) return cached;

  const entry = buildHardwareEntry(hwKey, model);
  if (entry) {
    hwCache.set(cacheKey, entry);
    return entry;
  }

  console.warn(`[getHardwareConfig] Unknown base GPU in "${hwKey}"`);
  return UNKNOWN_HARDWARE;
}
