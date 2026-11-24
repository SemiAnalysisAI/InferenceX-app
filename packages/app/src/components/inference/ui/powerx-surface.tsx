'use client';

import { createContext, useContext } from 'react';

import type { InferenceData } from '../types';

/**
 * True when the inference chart renders as the dedicated PowerX dashboard tab
 * rather than inside Inference Performance. Lets the shared chart stack swap
 * the generic Y-axis picker for page-level PowerX questions.
 */
export const PowerXSurfaceContext = createContext(false);

/**
 * Compare at: the interactivity every PowerX tab reads at (`i_at`, default 80 tok/s/user).
 * The context strip and the Breakdown drill-down move it.
 * Split into value and setter so charts that only write it do not re-render when it changes.
 */
export const CompareTargetContext = createContext<number | null>(null);
export const SetCompareTargetContext = createContext<((value: number | null) => void) | null>(null);
/** The page publishes the interactivity range its visible GPUs cover (see the default clamp). */
export const SetCompareRangeContext = createContext<
  ((range: readonly [number, number] | null) => void) | null
>(null);

/**
 * Whether the Breakdown view counts the facility (PUE) overhead. On by default so
 * PowerX shows facility power like the rest of the site; switch it off for IT only.
 */
export const IncludeFacilityContext = createContext(true);
export const SetIncludeFacilityContext = createContext<((value: boolean) => void) | null>(null);

/**
 * The point the readout row under the caption describes: hovered, scrubbed (a
 * finger on the chart, PowerX on a coarse pointer), pinned, or none.
 */
export interface PowerXActivePoint {
  point: InferenceData;
  source: 'hover' | 'scrub' | 'pinned';
  /** The point's series colour, so a readout's dot matches the chart. */
  color?: string;
}
export const ActivePointContext = createContext<PowerXActivePoint | null>(null);
/** `null` ends a hover (a pinned point stays); `'clear'` drops a pinned point too. */
export type PowerXActivePointUpdate = PowerXActivePoint | null | 'clear';
export const SetActivePointContext = createContext<
  ((value: PowerXActivePointUpdate) => void) | null
>(null);

export function usePowerXSurface(): boolean {
  return useContext(PowerXSurfaceContext);
}

/** Compare at (tok/s/user) on PowerX; null outside PowerX. */
export function usePowerXCompareTarget(): number | null {
  return useContext(CompareTargetContext);
}

/** Setter for the shared comparison interactivity; null outside PowerX. */
export function useSetPowerXCompareTarget(): ((value: number | null) => void) | null {
  return useContext(SetCompareTargetContext);
}

/** Publishes the covered interactivity range the default Compare at clamps into. */
export function useSetPowerXCompareRange():
  | ((range: readonly [number, number] | null) => void)
  | null {
  return useContext(SetCompareRangeContext);
}

/** Whether breakdown stacks include the facility (PUE) part; always true outside PowerX. */
export function usePowerXIncludeFacility(): boolean {
  return useContext(IncludeFacilityContext);
}

/** Setter for the Include facility switch; null outside PowerX. */
export function useSetPowerXIncludeFacility(): ((value: boolean) => void) | null {
  return useContext(SetIncludeFacilityContext);
}

/** The hovered or pinned chart point the PowerX readout describes; null outside PowerX. */
export function usePowerXActivePoint(): PowerXActivePoint | null {
  return useContext(ActivePointContext);
}

/** Setter for the readout point; null outside PowerX. */
export function useSetPowerXActivePoint(): ((value: PowerXActivePointUpdate) => void) | null {
  return useContext(SetActivePointContext);
}
