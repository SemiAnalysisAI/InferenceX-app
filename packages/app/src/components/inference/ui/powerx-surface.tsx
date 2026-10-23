'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * True when the inference chart renders as the dedicated PowerX dashboard tab
 * rather than inside Inference Performance. Lets the shared chart stack swap
 * the generic Y-axis picker for page-level PowerX questions.
 */
const PowerXSurfaceContext = createContext(false);

export function PowerXSurfaceProvider({ children }: { children: ReactNode }) {
  return <PowerXSurfaceContext.Provider value>{children}</PowerXSurfaceContext.Provider>;
}

export function usePowerXSurface(): boolean {
  return useContext(PowerXSurfaceContext);
}
