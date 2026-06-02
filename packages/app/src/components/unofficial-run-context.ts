'use client';

import { createContext, use } from 'react';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import type { EvalRow } from '@/lib/api';
import type { Model, Sequence } from '@/lib/data-mappings';

import type {
  AvailableModelSequence,
  UnofficialChartData,
  UnofficialRunInfo,
} from './unofficial-run-utils';

export interface UnofficialRunContextType {
  isUnofficialRun: boolean;
  /** First run in the loaded set — kept as a convenience alias for overlay labels. */
  unofficialRunInfo: UnofficialRunInfo | null;
  /** All runs loaded from the `unofficialrun(s)` URL param (comma-separated). */
  unofficialRunInfos: UnofficialRunInfo[];
  /**
   * Position of each run in the loaded set, keyed by both `run.url` and the
   * numeric id as a string. Used to derive a distinct hue shift per run for
   * overlay points so multiple runs are visually separable.
   */
  runIndexByUrl: Record<string, number>;
  unofficialChartData: UnofficialChartData | null;
  unofficialEvalRows: EvalRow[] | null;
  loading: boolean;
  error: string | null;
  /** Clear every unofficial run. Wipes state + URL. */
  clearUnofficialRun: () => void;
  /**
   * Drop a single run ID. Rewrites the URL to the remaining IDs and filters
   * local state (chart data + eval rows + run infos) by `run_url` without
   * refetching the others.
   */
  dismissRun: (runId: string) => void;
  availableModelsAndSequences: AvailableModelSequence[];
  getOverlayData: (
    model: Model,
    sequence: Sequence,
    chartType: 'e2e' | 'interactivity',
  ) => {
    data: InferenceData[];
    hardwareConfig: HardwareConfig;
  } | null;
  // Shared overlay toggle state — both charts read/write the same sets
  activeOverlayHwTypes: Set<string>;
  setActiveOverlayHwTypes: (v: Set<string>) => void;
  allOverlayHwTypes: Set<string>;
  toggleOverlayHwType: (key: string) => void;
  resetOverlayHwTypes: () => void;
  localOfficialOverride: Set<string> | null;
  setLocalOfficialOverride: (v: Set<string> | null) => void;
}

/** @internal Exported for test provider wrapping only. */
export const UnofficialRunContext = createContext<UnofficialRunContextType | undefined>(undefined);

export function useUnofficialRun() {
  const context = use(UnofficialRunContext);
  if (!context) {
    throw new Error('useUnofficialRun must be used within an UnofficialRunProvider');
  }
  return context;
}
