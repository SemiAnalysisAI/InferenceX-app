'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

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

export function PowerXSurfaceProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<number | null>(null);
  return (
    <PowerXSurfaceContext.Provider value>
      <SetCompareTargetContext.Provider value={setTarget}>
        <CompareTargetContext.Provider value={target}>{children}</CompareTargetContext.Provider>
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
