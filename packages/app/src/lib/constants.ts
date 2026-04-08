import { FRAMEWORK_LABELS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

/** d3.schemeTableau10 — 10-color categorical palette for tracked configs. */
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
  power: number;
  costh: number;
  costn: number;
  costr: number;
}

const DEFAULT_SPECS: GpuSpecs = { power: 0, costh: 0, costn: 0, costr: 0 };

/**
 * Look up power/cost specs for a hardware key by extracting the base GPU name.
 * Splits on '_' or '-' to get the base (e.g. "h100_vllm" -> "h100").
 */
export function getGpuSpecs(hwKey: string): GpuSpecs {
  const base = hwKey.split(/[-_]/)[0];
  const entry = HW_REGISTRY[base];
  if (!entry) return DEFAULT_SPECS;
  return { power: entry.power, costh: entry.costh, costn: entry.costn, costr: entry.costr };
}

/** Build the vendor prefix string for the `gpu` tooltip field. */
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
}

const UNKNOWN_HARDWARE: HardwareEntry = {
  name: 'unknown',
  label: 'Unknown',
  suffix: '',
  gpu: 'Unknown Hardware',
};

/**
 * Build a hardware config entry from a key like "h100_dynamo-trt_mtp".
 * Derives all display fields from GPU_KEYS/GPU_VENDORS + FRAMEWORK_LABELS.
 */
function buildHardwareEntry(hwKey: string): HardwareEntry | null {
  const base = hwKey.split('_')[0];
  const reg = HW_REGISTRY[base];
  if (!reg) return null;

  const parts = hwKey.split('_').slice(1);
  const label = reg.label;
  const gpuName = base.toUpperCase(); // always raw uppercase for gpu string
  const partLabels = parts.map((p) => FRAMEWORK_LABELS[p] ?? p.toUpperCase());

  return {
    name: hwKey.replaceAll('_', '-'),
    label,
    suffix: partLabels.length > 0 ? `(${partLabels.join(', ')})` : '',
    gpu: [getVendorPrefix(base), gpuName, ...partLabels].join(' '),
  };
}

/**
 * Maps a canonical GPU key to one or more legacy/alias keys whose data should be
 * merged in transparently. When a user selects the canonical key, availability and
 * chart data from alias keys is included and the alias hwKey is remapped to canonical.
 *
 * Use case: the GB200 NVL72 TRT backend was renamed from `trtllm` → `trt` around
 * Dec 7 2025, splitting the date history across two keys in availability.json.
 */
export const GPU_KEY_ALIASES: Record<string, string[]> = {
  'gb200_dynamo-trt': ['gb200_dynamo-trtllm'],
  'gb200_dynamo-trt_mtp': ['gb200_dynamo-trtllm_mtp'],
  'gb300_dynamo-trt': ['gb300_dynamo-trtllm'],
  'gb300_dynamo-trt_mtp': ['gb300_dynamo-trtllm_mtp'],
};

/**
 * Inverse map: alias key → canonical key. Derived from GPU_KEY_ALIASES.
 * Used for O(1) hwKey remapping when filtering chart data.
 */
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

/** Returns true if the base GPU in a hardware key is recognized. */
export function isKnownGpu(hwKey: string): boolean {
  return hwKey.split('_')[0] in HW_REGISTRY;
}

/** Cache for buildHardwareEntry results. */
const hwCache = new Map<string, HardwareEntry>();

/**
 * Get hardware config for a GPU key, building it dynamically from shared GPU constants + FRAMEWORK_LABELS.
 * Returns UNKNOWN_HARDWARE for unrecognized base GPUs.
 */
export function getHardwareConfig(hwKey: string): HardwareEntry {
  const cached = hwCache.get(hwKey);
  if (cached) return cached;

  const entry = buildHardwareEntry(hwKey);
  if (entry) {
    hwCache.set(hwKey, entry);
    return entry;
  }

  console.warn(`[getHardwareConfig] Unknown base GPU in "${hwKey}"`);
  return UNKNOWN_HARDWARE;
}
