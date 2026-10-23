import { getHardwareConfig } from '@/lib/catalog/constants';
import { getDisplayLabel } from '@/lib/shared/utils';

export function hardwareLegendLabel(hwKey: string, model?: string): string {
  return getDisplayLabel(getHardwareConfig(hwKey, model));
}

export function unitFromLabel(label: string): string | null {
  const match = /\((?<unit>[^()]+)\)\s*$/u.exec(label);
  return match?.groups?.unit ?? null;
}
