import type { InferenceData } from '@/components/inference/types';

export interface ChipCounts {
  /**
   * Physical Chips column value. On the modeled system-power axis this is the
   * telemetry-validated GPU count; elsewhere it is the legacy configured count.
   */
  physical: number;
  /**
   * Legacy configured count. Ingested aliases can encode TP × EP twice, so the
   * modeled axis shows it beside `physical` instead of replacing it silently.
   */
  configured: number;
}

/** Single source for the table, CSV, and tooltip chip-count columns. */
export function chipCounts(
  d: Pick<InferenceData, 'physicalChips' | 'tp' | 'modeledSystemPower'>,
  showModeledPower: boolean,
): ChipCounts {
  const configured = d.physicalChips ?? d.tp;
  const physical =
    showModeledPower && d.modeledSystemPower?.status === 'supported'
      ? d.modeledSystemPower.gpuCount
      : configured;
  return { physical, configured };
}
