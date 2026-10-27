'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { InferenceData } from '../types';

/**
 * True when the inference chart renders as the dedicated PowerX dashboard tab
 * rather than inside Inference Performance. Lets the shared chart stack swap
 * the generic Y-axis picker for page-level PowerX questions.
 */
const PowerXSurfaceContext = createContext(false);

/**
 * The interactivity the chip comparison is read at. The main chart, the
 * comparison slider and the per-chip drill-down all move it, so the overview
 * and the detail stay on the same point. Split into value and setter so charts
 * that only write it do not re-render when it changes.
 */
const CompareTargetContext = createContext<number | null>(null);
const SetCompareTargetContext = createContext<((value: number | null) => void) | null>(null);

/**
 * Whether the Where view counts the facility (PUE) overhead. PowerX stacks IT
 * only by default; outside PowerX the breakdown always shows the facility meter.
 */
const IncludeFacilityContext = createContext(true);
const SetIncludeFacilityContext = createContext<((value: boolean) => void) | null>(null);

/** The point the readout row under the caption describes: hovered, pinned, or none. */
export interface PowerXActivePoint {
  point: InferenceData;
  source: 'hover' | 'pinned';
}
const ActivePointContext = createContext<PowerXActivePoint | null>(null);
/** `null` ends a hover (a pinned point stays); `'clear'` drops a pinned point too. */
export type PowerXActivePointUpdate = PowerXActivePoint | null | 'clear';
const SetActivePointContext = createContext<((value: PowerXActivePointUpdate) => void) | null>(
  null,
);

export function PowerXSurfaceProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<number | null>(null);
  const [includeFacility, setIncludeFacility] = useState(false);
  const [activePoint, setActivePointState] = useState<PowerXActivePoint | null>(null);
  // A hover never replaces a pinned point; hover end only clears a hover.
  const setActivePoint = useMemo(
    () => (next: PowerXActivePointUpdate) =>
      setActivePointState((current) => {
        if (next === 'clear') return null;
        if (next === null) return current?.source === 'pinned' ? current : null;
        if (next.source === 'hover' && current?.source === 'pinned') return current;
        return next;
      }),
    [],
  );
  return (
    <PowerXSurfaceContext.Provider value>
      <SetCompareTargetContext.Provider value={setTarget}>
        <CompareTargetContext.Provider value={target}>
          <SetIncludeFacilityContext.Provider value={setIncludeFacility}>
            <IncludeFacilityContext.Provider value={includeFacility}>
              <SetActivePointContext.Provider value={setActivePoint}>
                <ActivePointContext.Provider value={activePoint}>
                  {children}
                </ActivePointContext.Provider>
              </SetActivePointContext.Provider>
            </IncludeFacilityContext.Provider>
          </SetIncludeFacilityContext.Provider>
        </CompareTargetContext.Provider>
      </SetCompareTargetContext.Provider>
    </PowerXSurfaceContext.Provider>
  );
}

export function usePowerXSurface(): boolean {
  return useContext(PowerXSurfaceContext);
}

/** Shared comparison interactivity; null outside PowerX or before anyone picks one. */
export function usePowerXCompareTarget(): number | null {
  return useContext(CompareTargetContext);
}

/** Setter for the shared comparison interactivity; null outside PowerX. */
export function useSetPowerXCompareTarget(): ((value: number | null) => void) | null {
  return useContext(SetCompareTargetContext);
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
