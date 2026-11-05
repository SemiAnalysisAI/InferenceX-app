import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { getDisplayLabel } from '@/lib/shared/utils';

export function hardwareLegendLabel(
  hwKey: string,
  model?: string,
  points: readonly { run_url?: string | null; router_name?: string | null }[] = [],
): string {
  return getDisplayLabel(getInferenceHardwareConfig(hwKey, model, points));
}

export function unitFromLabel(label: string): string | null {
  const match = /\((?<unit>[^()]+)\)\s*$/u.exec(label);
  return match?.groups?.unit ?? null;
}
