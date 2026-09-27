import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { GPU_SPECS, type GpuSpec } from '@/lib/gpu-specs';
import { getModelSortIndex } from '@/lib/constants';
import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';

export function hardwareLabel(key: string): string {
  return HW_REGISTRY[key]?.label ?? key.toUpperCase();
}

export function sortHardware(keys: string[]): string[] {
  return [...keys].sort(
    (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
  );
}

function spec(key: string): GpuSpec | undefined {
  const label = HW_REGISTRY[key]?.label;
  return label ? GPU_SPECS.find((s) => s.name.startsWith(label)) : undefined;
}

/** Dense peak TFLOPS at a precision, from the GPU specs table; null when unknown. */
export function peakTflops(key: string, precision: ComputePrecision): number | null {
  const s = spec(key);
  if (!s || precision === 'other') return null;
  return s[precision] ?? null;
}

/** Peak memory bandwidth in TB/s, parsed from the GPU specs table. */
export function peakBandwidthTBs(key: string): number | null {
  const m = spec(key)?.memoryBandwidth.match(/(?<tbs>[\d.]+)\s*TB\/s/u);
  return m ? Number(m.groups?.tbs) : null;
}
