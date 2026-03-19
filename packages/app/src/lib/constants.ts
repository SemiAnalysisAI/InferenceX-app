import { HardwareConfig } from '@/components/inference/types';

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

/**
 * Per-base-GPU power and cost constants.
 * Deduplicated from HARDWARE_CONFIG — every variant of a base GPU shares the same specs.
 */
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

export const HARDWARE_CONFIG: HardwareConfig = {
  h100: {
    name: 'h100',
    label: 'H100',
    suffix: '',
    gpu: "NVIDIA 'Hopper' H100",
    color: 'var(--h100)',
  },
  'h100_dynamo-trt': {
    name: 'h100-dynamo-trt',
    label: 'H100',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Hopper' H100 Dynamo TRT",
    color: 'var(--h100-dynamo-trt)',
  },
  'h100_dynamo-trt_mtp': {
    name: 'h100-dynamo-trt-mtp',
    label: 'H100',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Hopper' H100 Dynamo TRT MTP",
    color: 'var(--h100-dynamo-trt-mtp)',
  },
  'h100_dynamo-sglang_mtp': {
    name: 'h100-dynamo-sglang-mtp',
    label: 'H100',
    suffix: '(Dynamo SGLang, MTP)',
    gpu: "NVIDIA 'Hopper' H100 Dynamo SGLang MTP",
    color: 'var(--h100-dynamo-sglang-mtp)',
  },
  h100_vllm: {
    name: 'h100-vllm',
    label: 'H100',
    suffix: '(vLLM)',
    gpu: "NVIDIA 'Hopper' H100 vLLM",
    color: 'var(--h100-vllm)',
  },
  h200: {
    name: 'h200',
    label: 'H200',
    suffix: '',
    gpu: "NVIDIA 'Hopper' H200",
    color: 'var(--h200)',
  },
  h200_trt: {
    name: 'h200-trt',
    label: 'H200',
    suffix: '(TRT)',
    gpu: "NVIDIA 'Hopper' H200 TRT",
    color: 'var(--h200-trt)',
  },
  h200_trt_mtp: {
    name: 'h200-trt-mtp',
    label: 'H200',
    suffix: '(TRT, MTP)',
    gpu: "NVIDIA 'Hopper' H200 TRT MTP",
    color: 'var(--h200-trt-mtp)',
  },
  'h200_dynamo-trt': {
    name: 'h200-dynamo-trt',
    label: 'H200',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo TRT",
    color: 'var(--h200-dynamo-trt)',
  },
  'h200_dynamo-trt_mtp': {
    name: 'h200-dynamo-trt-mtp',
    label: 'H200',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo TRT MTP",
    color: 'var(--h200-dynamo-trt-mtp)',
  },
  h200_sglang: {
    name: 'h200-sglang',
    label: 'H200',
    suffix: '(SGLang)',
    gpu: "NVIDIA 'Hopper' H200 SGLang",
    color: 'var(--h200-sglang)',
  },
  'h200_dynamo-sglang': {
    name: 'h200-dynamo-sglang',
    label: 'H200',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo SGLang",
    color: 'var(--h200-dynamo-sglang)',
  },
  'h200_dynamo-sglang_mtp': {
    name: 'h200-dynamo-sglang-mtp',
    label: 'H200',
    suffix: '(Dynamo SGLang, MTP)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo SGLang MTP",
    color: 'var(--h200-dynamo-sglang-mtp)',
  },
  h200_vllm: {
    name: 'h200-vllm',
    label: 'H200',
    suffix: '(vLLM)',
    gpu: "NVIDIA 'Hopper' H200 vLLM",
    color: 'var(--h200-vllm)',
  },
  b200: {
    name: 'b200',
    label: 'B200',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' B200",
    color: 'var(--b200)',
  },
  b200_trt: {
    name: 'b200-trt',
    label: 'B200',
    suffix: '(TRT)',
    gpu: "NVIDIA 'Blackwell' B200 TRT",
    color: 'var(--b200-trt)',
  },
  b200_trt_mtp: {
    name: 'b200-trt-mtp',
    label: 'B200',
    suffix: '(TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 TRT MTP",
    color: 'var(--b200-trt-mtp)',
  },
  'b200_dynamo-trt': {
    name: 'b200-dynamo-trt',
    label: 'B200',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo TRT",
    color: 'var(--b200-dynamo-trt)',
  },
  'b200_dynamo-trt_mtp': {
    name: 'b200-dynamo-trt-mtp',
    label: 'B200',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo TRT MTP",
    color: 'var(--b200-dynamo-trt-mtp)',
  },
  b200_sglang: {
    name: 'b200-sglang',
    label: 'B200',
    suffix: '(SGLang)',
    gpu: "NVIDIA 'Blackwell' B200 SGLang",
    color: 'var(--b200-sglang)',
  },
  b200_sglang_mtp: {
    name: 'b200-sglang-mtp',
    label: 'B200',
    suffix: '(SGLang, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 SGLang MTP",
    color: 'var(--b200-sglang-mtp)',
  },
  'b200_dynamo-sglang': {
    name: 'b200-dynamo-sglang',
    label: 'B200',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo SGLang",
    color: 'var(--b200-dynamo-sglang)',
  },
  'b200_dynamo-sglang_mtp': {
    name: 'b200-dynamo-sglang-mtp',
    label: 'B200',
    suffix: '(Dynamo SGLang, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo SGLang MTP",
    color: 'var(--b200-dynamo-sglang-mtp)',
  },
  b200_vllm: {
    name: 'b200-vllm',
    label: 'B200',
    suffix: '(vLLM)',
    gpu: "NVIDIA 'Blackwell' B200 vLLM",
    color: 'var(--b200-vllm)',
  },
  b300: {
    name: 'b300',
    label: 'B300',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' B300",
    color: 'var(--b300)',
  },
  'b300_dynamo-trt': {
    name: 'b300-dynamo-trt',
    label: 'B300',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' B300 Dynamo TRT",
    color: 'var(--b300-dynamo-trt)',
  },
  'b300_dynamo-trt_mtp': {
    name: 'b300-dynamo-trt-mtp',
    label: 'B300',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' B300 Dynamo TRT MTP",
    color: 'var(--b300-dynamo-trt-mtp)',
  },
  gb200: {
    name: 'gb200',
    label: 'GB200 NVL72',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' GB200",
    color: 'var(--gb200)',
  },
  gb200_mtp: {
    name: 'gb200-mtp',
    label: 'GB200 NVL72',
    suffix: '(MTP)',
    gpu: "NVIDIA 'Blackwell' GB200 MTP",
    color: 'var(--gb200-mtp)',
  },
  'gb200_dynamo-trt': {
    name: 'gb200-dynamo-trt',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT",
    color: 'var(--gb200-dynamo-trt)',
  },
  'gb200_dynamo-trt_mtp': {
    name: 'gb200-dynamo-trt-mtp',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT MTP",
    color: 'var(--gb200-dynamo-trt-mtp)',
  },
  'gb200_dynamo-trtllm': {
    name: 'gb200-dynamo-trtllm',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT",
    color: 'var(--gb200-dynamo-trtllm)',
  },
  'gb200_dynamo-trtllm_mtp': {
    name: 'gb200-dynamo-trtllm-mtp',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT MTP",
    color: 'var(--gb200-dynamo-trtllm-mtp)',
  },
  'gb200_dynamo-sglang': {
    name: 'gb200-dynamo-sglang',
    label: 'GB200 NVL72',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo SGLang",
    color: 'var(--gb200-dynamo-sglang)',
  },
  gb300: {
    name: 'gb300',
    label: 'GB300 NVL72',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' GB300",
    color: 'var(--gb300)',
  },
  'gb300_dynamo-trt': {
    name: 'gb300-dynamo-trt',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT",
    color: 'var(--gb300-dynamo-trt)',
  },
  'gb300_dynamo-trt_mtp': {
    name: 'gb300-dynamo-trt-mtp',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT MTP",
    color: 'var(--gb300-dynamo-trt-mtp)',
  },
  'gb300_dynamo-trtllm': {
    name: 'gb300-dynamo-trtllm',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT",
    color: 'var(--gb300-dynamo-trtllm)',
  },
  'gb300_dynamo-trtllm_mtp': {
    name: 'gb300-dynamo-trtllm-mtp',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT MTP",
    color: 'var(--gb300-dynamo-trtllm-mtp)',
  },
  'gb300_dynamo-sglang': {
    name: 'gb300-dynamo-sglang',
    label: 'GB300 NVL72',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo SGLang",
    color: 'var(--gb300-dynamo-sglang)',
  },
  mi300x: {
    name: 'mi300x',
    label: 'MI300X',
    suffix: '',
    gpu: 'AMD MI300X',
    color: 'var(--mi300x)',
  },
  mi300x_sglang: {
    name: 'mi300x-sglang',
    label: 'MI300X',
    suffix: '(SGLang)',
    gpu: 'AMD MI300X SGLang',
    color: 'var(--mi300x-sglang)',
  },
  mi300x_vllm: {
    name: 'mi300x-vllm',
    label: 'MI300X',
    suffix: '(vLLM)',
    gpu: 'AMD MI300X vLLM',
    color: 'var(--mi300x-vllm)',
  },
  mi325x: {
    name: 'mi325x',
    label: 'MI325X',
    suffix: '',
    gpu: 'AMD MI325X',
    color: 'var(--mi325x)',
  },
  mi325x_sglang: {
    name: 'mi325x-sglang',
    label: 'MI325X',
    suffix: '(SGLang)',
    gpu: 'AMD MI325X SGLang',
    color: 'var(--mi325x-sglang)',
  },
  mi325x_vllm: {
    name: 'mi325x-vllm',
    label: 'MI325X',
    suffix: '(vLLM)',
    gpu: 'AMD MI325X vLLM',
    color: 'var(--mi325x-vllm)',
  },
  mi355x: {
    name: 'mi355x',
    label: 'MI355X',
    suffix: '',
    gpu: 'AMD MI355X',
    color: 'var(--mi355x)',
  },
  'mi355x_mori-sglang': {
    name: 'mi355x-mori-sglang',
    label: 'MI355X',
    suffix: '(MoRI SGLang)',
    gpu: 'AMD MI355X MoRI SGLang',
    color: 'var(--mi355x-mori-sglang)',
  },
  'mi355x_mori-sglang_mtp': {
    name: 'mi355x-mori-sglang-mtp',
    label: 'MI355X',
    suffix: '(MoRI SGLang, MTP)',
    gpu: 'AMD MI355X MoRI SGLang MTP',
    color: 'var(--mi355x-mori-sglang-mtp)',
  },
  mi355x_sglang: {
    name: 'mi355x-sglang',
    label: 'MI355X',
    suffix: '(SGLang)',
    gpu: 'AMD MI355X SGLang',
    color: 'var(--mi355x-sglang)',
  },
  mi355x_sglang_mtp: {
    name: 'mi355x-sglang-mtp',
    label: 'MI355X',
    suffix: '(SGLang, MTP)',
    gpu: 'AMD MI355X SGLang MTP',
    color: 'var(--mi355x-sglang-mtp)',
  },
  mi355x_vllm: {
    name: 'mi355x-vllm',
    label: 'MI355X',
    suffix: '(vLLM)',
    gpu: 'AMD MI355X vLLM',
    color: 'var(--mi355x-vllm)',
  },
  mi355x_atom: {
    name: 'mi355x-atom',
    label: 'MI355X',
    suffix: '(ATOM¹)',
    gpu: 'AMD MI355X ATOM',
    color: 'var(--mi355x-atom)',
  },
  mi355x_atom_mtp: {
    name: 'mi355x-atom-mtp',
    label: 'MI355X',
    suffix: '(ATOM¹, MTP)',
    gpu: 'AMD MI355X ATOM MTP',
    color: 'var(--mi355x-atom-mtp)',
  },
  unknown: {
    name: 'unknown',
    gpu: 'Unknown Hardware',
    label: 'Unknown',
    suffix: '',
    color: 'var(--foreground)',
  },
};

export const FRAMEWORK_LABELS: Record<string, string> = {
  trt: 'TRT',
  trtllm: 'TRT',
  vllm: 'vLLM',
  sglang: 'SGLang',
  'dynamo-sglang': 'Dynamo SGLang',
  'dynamo-trtllm': 'Dynamo TRT',
  'dynamo-trt': 'Dynamo TRT',
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

/**
 * Extract base hardware key from a full hardware key
 * Splits on '-' and '_' to get the base GPU model
 * @example "h100_vllm" -> "h100"
 * @example "h100-dynamo-trt" -> "h100"
 */
function getBaseHwKey(hwKey: string): string {
  return hwKey.split(/[-_]/)[0];
}

/**
 * Get hardware config for a GPU key with automatic base key fallback
 * Logs warnings for every missing key to help identify what needs to be added
 *
 * @param hwKey - GPU key to lookup (e.g., "h100_vllm", "h100")
 * @returns Hardware config, falling back to base key then unknown if not found
 */
export function getHardwareConfig(
  hwKey: string,
): (typeof HARDWARE_CONFIG)[keyof typeof HARDWARE_CONFIG] {
  let config = HARDWARE_CONFIG[hwKey as keyof typeof HARDWARE_CONFIG];

  if (!config) {
    console.warn(
      `[HARDWARE_CONFIG] GPU "${hwKey}" not found - add to HARDWARE_CONFIG in lib/constants.ts`,
    );

    const baseKey = getBaseHwKey(hwKey);
    if (baseKey !== hwKey) {
      config = HARDWARE_CONFIG[baseKey as keyof typeof HARDWARE_CONFIG];
      if (config) {
        console.info(`[HARDWARE_CONFIG] Using fallback "${baseKey}" for "${hwKey}"`);
      } else {
        console.warn(`[HARDWARE_CONFIG] Base GPU "${baseKey}" also not found - using unknown`);
        return HARDWARE_CONFIG.unknown;
      }
    } else {
      return HARDWARE_CONFIG.unknown;
    }
  }

  return config;
}

// cache to ensure each GPU gets a consistent, unique palette
const assignedPalettes = new Map<string, string[]>();
const vendorCounters = new Map<string, number>();

/**
 * Color families for GPU comparison charts
 */
const COLOR_FAMILIES = {
  nvidia: [
    ['#76b900', '#a3e635', '#4d7c00', '#caff66', '#2d5900', '#1a3d00'],
    ['#00cc66', '#33ff99', '#008844', '#66ffaa', '#005522', '#003311'],
  ],
  amd: [
    ['#e60000', '#ff4d4d', '#b30000', '#ff8080', '#800000', '#4d0000'],
    ['#ff5500', '#ff8533', '#cc4400', '#ffaa66', '#993300', '#662200'],
  ],
  unknown: [
    ['#3b82f6', '#60a5fa', '#1d4ed8', '#93c5fd', '#1e40af', '#0f2a5c'],
    ['#8b5cf6', '#a78bfa', '#6d28d9', '#c4b5fd', '#5b21b6', '#3b1f6b'],
  ],
};

/**
 * Get color family array for a specific GPU
 * Determines vendor from GPU key and returns appropriate color palette
 * Uses memory to avoid duplicate color assignments
 */
export function getColorFamily(hwKey: string): string[] {
  if (assignedPalettes.has(hwKey)) {
    return assignedPalettes.get(hwKey)!;
  }

  const isAMD = hwKey.startsWith('mi');
  const isNVIDIA = hwKey.startsWith('h') || hwKey.startsWith('b') || hwKey.startsWith('gb');

  const vendor = isAMD ? 'amd' : isNVIDIA ? 'nvidia' : 'other';

  let families: typeof COLOR_FAMILIES.nvidia;
  switch (vendor) {
    case 'amd':
      families = COLOR_FAMILIES.amd;
      break;
    case 'nvidia':
      families = COLOR_FAMILIES.nvidia;
      break;
    default:
      families = COLOR_FAMILIES.unknown;
  }

  // assign next available palette for this vendor
  const counter = vendorCounters.get(vendor) || 0;
  const paletteIndex = counter % families.length;
  vendorCounters.set(vendor, counter + 1);

  const palette = families[paletteIndex];
  assignedPalettes.set(hwKey, palette);

  return palette;
}
