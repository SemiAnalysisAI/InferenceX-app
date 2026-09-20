import { getHardwareConfig } from '@/lib/constants';

/**
 * Full dashboard legend text for a hardware key: the base GPU label plus the
 * framework / disagg / spec suffix (e.g. "GB300 NVL72 (Dynamo SGLang, MTP)").
 * Base-only keys have no suffix and collapse to the plain label. Pass `model`
 * (frontend display name) to apply per-model suffix overrides.
 */
export function hardwareLegendLabel(hwKey: string, model?: string): string {
  const entry = getHardwareConfig(hwKey, model);
  return [entry.label, entry.suffix].filter(Boolean).join(' ');
}
