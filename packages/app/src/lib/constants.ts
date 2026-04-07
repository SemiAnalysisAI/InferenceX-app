import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

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

/** Per-base-GPU power and cost constants used for energy/cost calculations. */
export const GPU_SPECS: Record<string, GpuSpecs> = {
  h100: { power: 1.73, costh: 1.3, costn: 1.69, costr: 1.3 },
  h200: { power: 1.73, costh: 1.41, costn: 1.74, costr: 1.6 },
  b200: { power: 2.17, costh: 1.95, costn: 2.34, costr: 2.9 },
  // TODO: B300 pricing is temporary - using 1.2x B200 pricing until official pricing is available
  b300: { power: 2.17, costh: 2.34, costn: 2.808, costr: 3.48 },
  gb200: { power: 2.1, costh: 2.21, costn: 2.75, costr: 3.3 },
  // TODO: GB300 pricing is temporary - using 1.2x GB200 pricing until official pricing is available
  gb300: { power: 2.1, costh: 2.652, costn: 3.3, costr: 3.96 },
  mi300x: { power: 1.79, costh: 1.12, costn: 1.4, costr: 1.55 },
  mi325x: { power: 2.18, costh: 1.28, costn: 1.59, costr: 1.8 },
  mi355x: { power: 2.65, costh: 1.48, costn: 1.9, costr: 2.1 },
};

/**
 * Look up power/cost specs for a hardware key by extracting the base GPU name.
 * Splits on '_' or '-' to get the base (e.g. "h100_vllm" -> "h100").
 */
export function getGpuSpecs(hwKey: string): GpuSpecs {
  const base = hwKey.split(/[-_]/)[0];
  return GPU_SPECS[base] ?? { power: 0, costh: 0, costn: 0, costr: 0 };
}

/** Build the vendor prefix string for the `gpu` tooltip field. */
function getVendorPrefix(base: string): string {
  const entry = HW_REGISTRY[base as keyof typeof HW_REGISTRY];
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
  const reg = HW_REGISTRY[base as keyof typeof HW_REGISTRY];
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

export const FRAMEWORK_LABELS: Record<string, string> = {
  trt: 'TRT',
  trtllm: 'TRT',
  vllm: 'vLLM',
  sglang: 'SGLang',
  'dynamo-sglang': 'Dynamo SGLang',
  'dynamo-trtllm': 'Dynamo TRT',
  'dynamo-trt': 'Dynamo TRT',
  'dynamo-vllm': 'Dynamo vLLM',
  'mori-sglang': 'MoRI SGLang',
  atom: 'ATOM¹',
  mtp: 'MTP',
};

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
export const MODEL_ORDER = [
  'gb300',
  'gb',
  'b300',
  'b',
  'mi355x',
  'h200',
  'mi325x',
  'h100',
  'mi300x',
];

export function getModelSortIndex(hwKey: string): number {
  const idx = MODEL_ORDER.findIndex((m) => hwKey.startsWith(m));
  return idx === -1 ? MODEL_ORDER.length : idx;
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
