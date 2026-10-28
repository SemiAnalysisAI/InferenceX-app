import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { OPERATORX_HARDWARE_REFERENCES } from '@semianalysisai/inferencex-db/operatorx/hardware';

import { GPU_SPECS, type GpuSpec } from '@/lib/catalog/gpu-specs';
import { getModelSortIndex } from '@/lib/catalog/constants';
import { generateVendorColors } from '@/lib/charts/dynamic-colors';
import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';

export function hardwareLabel(key: string): string {
  return OPERATORX_HARDWARE_REFERENCES[key]?.label ?? HW_REGISTRY[key]?.label ?? key.toUpperCase();
}

export function operatorXColors(keys: string[], theme: 'light' | 'dark'): Record<string, string> {
  return generateVendorColors(keys, theme);
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

/** Dense peak TFLOPS from an OperatorX reference or the GPU specs table; null when unknown. */
export function peakTflops(key: string, precision: ComputePrecision): number | null {
  const reference = OPERATORX_HARDWARE_REFERENCES[key];
  if (reference) return precision === 'other' ? null : reference.peakTflops[precision];
  const s = spec(key);
  if (!s || precision === 'other') return null;
  return s[precision] ?? null;
}

/** Reference memory bandwidth in TB/s, falling back to the GPU specs table. */
export function peakBandwidthTBs(key: string): number | null {
  const reference = OPERATORX_HARDWARE_REFERENCES[key];
  if (reference) return reference.memoryBandwidthTBs;
  const m = spec(key)?.memoryBandwidth.match(/(?<tbs>[\d.]+)\s*TB\/s/u);
  return m ? Number(m.groups?.tbs) : null;
}
