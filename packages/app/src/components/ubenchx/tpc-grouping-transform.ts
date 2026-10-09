/**
 * Shared pure transform for ubenchX TPC per GPC grouping.
 *
 * Used by both the UI component and the read-only API route so they cannot
 * silently calculate different results (AGENTS.md read-only coverage rule).
 */

import type { TpcGroupingRun } from './tpc-grouping-data';

export interface TpcGroupingViewResult {
  readonly gpu: string;
  readonly tpcsPerGpc: readonly number[];
  readonly gpcCount: number;
  readonly tpcCount: number;
  /** Each TPC holds two SMs. */
  readonly smCount: number;
  readonly metadata: Omit<TpcGroupingRun, 'tpcsPerGpc'>;
}

export function transformTpcGroupingRun(
  gpuKey: string,
  run: TpcGroupingRun,
): TpcGroupingViewResult {
  const { tpcsPerGpc, ...metadata } = run;
  const tpcCount = tpcsPerGpc.reduce((total, tpcs) => total + tpcs, 0);
  return {
    gpu: gpuKey,
    tpcsPerGpc,
    gpcCount: tpcsPerGpc.length,
    tpcCount,
    smCount: tpcCount * 2,
    metadata,
  };
}
