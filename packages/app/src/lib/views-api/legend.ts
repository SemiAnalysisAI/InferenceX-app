import { getHardwareConfig } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';

/**
 * Full dashboard legend text for a hardware key: the base GPU label plus the
 * framework / disagg / spec suffix (e.g. "GB300 NVL72 (Dynamo SGLang, MTP)").
 * Base-only keys have no suffix and collapse to the plain label. Pass `model`
 * (frontend display name) to apply per-model suffix overrides.
 */
export function hardwareLegendLabel(hwKey: string, model?: string): string {
  // Same composition the dashboard legend uses (`getDisplayLabel`).
  return getDisplayLabel(getHardwareConfig(hwKey, model));
}
