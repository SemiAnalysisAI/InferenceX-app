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
  },
  'h100_dynamo-trt': {
    name: 'h100-dynamo-trt',
    label: 'H100',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Hopper' H100 Dynamo TRT",
  },
  'h100_dynamo-trt_mtp': {
    name: 'h100-dynamo-trt-mtp',
    label: 'H100',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Hopper' H100 Dynamo TRT MTP",
  },
  'h100_dynamo-sglang_mtp': {
    name: 'h100-dynamo-sglang-mtp',
    label: 'H100',
    suffix: '(Dynamo SGLang, MTP)',
    gpu: "NVIDIA 'Hopper' H100 Dynamo SGLang MTP",
  },
  h100_vllm: {
    name: 'h100-vllm',
    label: 'H100',
    suffix: '(vLLM)',
    gpu: "NVIDIA 'Hopper' H100 vLLM",
  },
  h200: {
    name: 'h200',
    label: 'H200',
    suffix: '',
    gpu: "NVIDIA 'Hopper' H200",
  },
  h200_trt: {
    name: 'h200-trt',
    label: 'H200',
    suffix: '(TRT)',
    gpu: "NVIDIA 'Hopper' H200 TRT",
  },
  h200_trt_mtp: {
    name: 'h200-trt-mtp',
    label: 'H200',
    suffix: '(TRT, MTP)',
    gpu: "NVIDIA 'Hopper' H200 TRT MTP",
  },
  'h200_dynamo-trt': {
    name: 'h200-dynamo-trt',
    label: 'H200',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo TRT",
  },
  'h200_dynamo-trt_mtp': {
    name: 'h200-dynamo-trt-mtp',
    label: 'H200',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo TRT MTP",
  },
  h200_sglang: {
    name: 'h200-sglang',
    label: 'H200',
    suffix: '(SGLang)',
    gpu: "NVIDIA 'Hopper' H200 SGLang",
  },
  'h200_dynamo-sglang': {
    name: 'h200-dynamo-sglang',
    label: 'H200',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo SGLang",
  },
  'h200_dynamo-sglang_mtp': {
    name: 'h200-dynamo-sglang-mtp',
    label: 'H200',
    suffix: '(Dynamo SGLang, MTP)',
    gpu: "NVIDIA 'Hopper' H200 Dynamo SGLang MTP",
  },
  h200_vllm: {
    name: 'h200-vllm',
    label: 'H200',
    suffix: '(vLLM)',
    gpu: "NVIDIA 'Hopper' H200 vLLM",
  },
  b200: {
    name: 'b200',
    label: 'B200',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' B200",
  },
  b200_trt: {
    name: 'b200-trt',
    label: 'B200',
    suffix: '(TRT)',
    gpu: "NVIDIA 'Blackwell' B200 TRT",
  },
  b200_trt_mtp: {
    name: 'b200-trt-mtp',
    label: 'B200',
    suffix: '(TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 TRT MTP",
  },
  'b200_dynamo-trt': {
    name: 'b200-dynamo-trt',
    label: 'B200',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo TRT",
  },
  'b200_dynamo-trt_mtp': {
    name: 'b200-dynamo-trt-mtp',
    label: 'B200',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo TRT MTP",
  },
  b200_sglang: {
    name: 'b200-sglang',
    label: 'B200',
    suffix: '(SGLang)',
    gpu: "NVIDIA 'Blackwell' B200 SGLang",
  },
  b200_sglang_mtp: {
    name: 'b200-sglang-mtp',
    label: 'B200',
    suffix: '(SGLang, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 SGLang MTP",
  },
  'b200_dynamo-sglang': {
    name: 'b200-dynamo-sglang',
    label: 'B200',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo SGLang",
  },
  'b200_dynamo-sglang_mtp': {
    name: 'b200-dynamo-sglang-mtp',
    label: 'B200',
    suffix: '(Dynamo SGLang, MTP)',
    gpu: "NVIDIA 'Blackwell' B200 Dynamo SGLang MTP",
  },
  b200_vllm: {
    name: 'b200-vllm',
    label: 'B200',
    suffix: '(vLLM)',
    gpu: "NVIDIA 'Blackwell' B200 vLLM",
  },
  b300: {
    name: 'b300',
    label: 'B300',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' B300",
  },
  'b300_dynamo-trt': {
    name: 'b300-dynamo-trt',
    label: 'B300',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' B300 Dynamo TRT",
  },
  'b300_dynamo-trt_mtp': {
    name: 'b300-dynamo-trt-mtp',
    label: 'B300',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' B300 Dynamo TRT MTP",
  },
  gb200: {
    name: 'gb200',
    label: 'GB200 NVL72',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' GB200",
  },
  gb200_mtp: {
    name: 'gb200-mtp',
    label: 'GB200 NVL72',
    suffix: '(MTP)',
    gpu: "NVIDIA 'Blackwell' GB200 MTP",
  },
  'gb200_dynamo-trt': {
    name: 'gb200-dynamo-trt',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT",
  },
  'gb200_dynamo-trt_mtp': {
    name: 'gb200-dynamo-trt-mtp',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT MTP",
  },
  'gb200_dynamo-trtllm': {
    name: 'gb200-dynamo-trtllm',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT",
  },
  'gb200_dynamo-trtllm_mtp': {
    name: 'gb200-dynamo-trtllm-mtp',
    label: 'GB200 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo TRT MTP",
  },
  'gb200_dynamo-sglang': {
    name: 'gb200-dynamo-sglang',
    label: 'GB200 NVL72',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Blackwell' GB200 Dynamo SGLang",
  },
  gb300: {
    name: 'gb300',
    label: 'GB300 NVL72',
    suffix: '',
    gpu: "NVIDIA 'Blackwell' GB300",
  },
  'gb300_dynamo-trt': {
    name: 'gb300-dynamo-trt',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT",
  },
  'gb300_dynamo-trt_mtp': {
    name: 'gb300-dynamo-trt-mtp',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT MTP",
  },
  'gb300_dynamo-trtllm': {
    name: 'gb300-dynamo-trtllm',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT",
  },
  'gb300_dynamo-trtllm_mtp': {
    name: 'gb300-dynamo-trtllm-mtp',
    label: 'GB300 NVL72',
    suffix: '(Dynamo TRT, MTP)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo TRT MTP",
  },
  'gb300_dynamo-sglang': {
    name: 'gb300-dynamo-sglang',
    label: 'GB300 NVL72',
    suffix: '(Dynamo SGLang)',
    gpu: "NVIDIA 'Blackwell' GB300 Dynamo SGLang",
  },
  mi300x: {
    name: 'mi300x',
    label: 'MI300X',
    suffix: '',
    gpu: 'AMD MI300X',
  },
  mi300x_sglang: {
    name: 'mi300x-sglang',
    label: 'MI300X',
    suffix: '(SGLang)',
    gpu: 'AMD MI300X SGLang',
  },
  mi300x_vllm: {
    name: 'mi300x-vllm',
    label: 'MI300X',
    suffix: '(vLLM)',
    gpu: 'AMD MI300X vLLM',
  },
  mi325x: {
    name: 'mi325x',
    label: 'MI325X',
    suffix: '',
    gpu: 'AMD MI325X',
  },
  'mi325x_mori-sglang': {
    name: 'mi325x-mori-sglang',
    label: 'MI325X',
    suffix: '(MoRI SGLang)',
    gpu: 'AMD MI325X MoRI SGLang',
  },
  'mi325x_mori-sglang_mtp': {
    name: 'mi325x-mori-sglang-mtp',
    label: 'MI325X',
    suffix: '(MoRI SGLang, MTP)',
    gpu: 'AMD MI325X MoRI SGLang MTP',
  },
  mi325x_sglang: {
    name: 'mi325x-sglang',
    label: 'MI325X',
    suffix: '(SGLang)',
    gpu: 'AMD MI325X SGLang',
  },
  mi325x_sglang_mtp: {
    name: 'mi325x-sglang-mtp',
    label: 'MI325X',
    suffix: '(SGLang, MTP)',
    gpu: 'AMD MI325X SGLang MTP',
  },
  mi325x_vllm: {
    name: 'mi325x-vllm',
    label: 'MI325X',
    suffix: '(vLLM)',
    gpu: 'AMD MI325X vLLM',
  },
  mi355x: {
    name: 'mi355x',
    label: 'MI355X',
    suffix: '',
    gpu: 'AMD MI355X',
  },
  'mi355x_mori-sglang': {
    name: 'mi355x-mori-sglang',
    label: 'MI355X',
    suffix: '(MoRI SGLang)',
    gpu: 'AMD MI355X MoRI SGLang',
  },
  'mi355x_mori-sglang_mtp': {
    name: 'mi355x-mori-sglang-mtp',
    label: 'MI355X',
    suffix: '(MoRI SGLang, MTP)',
    gpu: 'AMD MI355X MoRI SGLang MTP',
  },
  mi355x_sglang: {
    name: 'mi355x-sglang',
    label: 'MI355X',
    suffix: '(SGLang)',
    gpu: 'AMD MI355X SGLang',
  },
  mi355x_sglang_mtp: {
    name: 'mi355x-sglang-mtp',
    label: 'MI355X',
    suffix: '(SGLang, MTP)',
    gpu: 'AMD MI355X SGLang MTP',
  },
  mi355x_vllm: {
    name: 'mi355x-vllm',
    label: 'MI355X',
    suffix: '(vLLM)',
    gpu: 'AMD MI355X vLLM',
  },
  mi355x_atom: {
    name: 'mi355x-atom',
    label: 'MI355X',
    suffix: '(ATOM¹)',
    gpu: 'AMD MI355X ATOM',
  },
  mi355x_atom_mtp: {
    name: 'mi355x-atom-mtp',
    label: 'MI355X',
    suffix: '(ATOM¹, MTP)',
    gpu: 'AMD MI355X ATOM MTP',
  },
  unknown: {
    name: 'unknown',
    gpu: 'Unknown Hardware',
    label: 'Unknown',
    suffix: '',
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
