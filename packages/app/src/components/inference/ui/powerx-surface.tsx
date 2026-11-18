'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { readUrlParams, writeUrlParams } from '@/lib/routing/url-state';

import {
  parsePowerXCompareAt,
  POWERX_COMPARE_AT_DEFAULT,
  resolvePowerXCompareAt,
  serializePowerXCompareAt,
} from '../powerx/powerx-compare-at';
import type { InferenceData } from '../types';

/**
 * True when the inference chart renders as the dedicated PowerX dashboard tab
 * rather than inside Inference Performance. Lets the shared chart stack swap
 * the generic Y-axis picker for page-level PowerX questions.
 */
const PowerXSurfaceContext = createContext(false);

/**
 * Compare at: the interactivity every PowerX tab reads at (`i_at`, default 80 tok/s/user).
 * The context strip, the reading line on the chart and the Breakdown drill-down move it.
 * Split into value and setter so charts that only write it do not re-render when it changes.
 */
const CompareTargetContext = createContext<number | null>(null);
const SetCompareTargetContext = createContext<((value: number | null) => void) | null>(null);
/** The page publishes the interactivity range its visible GPUs cover (see the default clamp). */
const SetCompareRangeContext = createContext<
  ((range: readonly [number, number] | null) => void) | null
>(null);

/**
 * Whether the Where view counts the facility (PUE) overhead. On by default so
 * PowerX shows facility power like the rest of the site; switch it off for IT only.
 */
const IncludeFacilityContext = createContext(true);
const SetIncludeFacilityContext = createContext<((value: boolean) => void) | null>(null);

/**
 * The point the readout row under the caption describes: hovered, scrubbed (a
 * finger on the chart, PowerX on a coarse pointer), pinned, or none.
 */
export interface PowerXActivePoint {
  point: InferenceData;
  source: 'hover' | 'scrub' | 'pinned';
  /** The point's series colour, so the pinned strip's dot matches the chart. */
  color?: string;
}
const ActivePointContext = createContext<PowerXActivePoint | null>(null);
/** `null` ends a hover (a pinned point stays); `'clear'` drops a pinned point too. */
export type PowerXActivePointUpdate = PowerXActivePoint | null | 'clear';
const SetActivePointContext = createContext<((value: PowerXActivePointUpdate) => void) | null>(
  null,
);

export function PowerXSurfaceProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<{ value: number; explicit: boolean }>(() => {
    const raw = readUrlParams().i_at;
    return { value: parsePowerXCompareAt(raw), explicit: Boolean(raw) };
  });
  const [range, setRangeState] = useState<readonly [number, number] | null>(null);
  const setRange = useMemo(
    () => (next: readonly [number, number] | null) =>
      setRangeState((current) =>
        current?.[0] === next?.[0] && current?.[1] === next?.[1] ? current : next,
      ),
    [],
  );
  const target = resolvePowerXCompareAt(stored.value, stored.explicit, range);
  // A pick is explicit and lands in `i_at`; `null` returns to the (clamped) default.
  const setTarget = useMemo(
    () => (value: number | null) => {
      const next = parsePowerXCompareAt(
        value === null ? String(POWERX_COMPARE_AT_DEFAULT) : String(value),
      );
      setStored({ value: next, explicit: value !== null });
      writeUrlParams({ i_at: value === null ? '' : serializePowerXCompareAt(next) });
    },
    [],
  );
  const [includeFacility, setIncludeFacility] = useState(true);
  const [activePoint, setActivePointState] = useState<PowerXActivePoint | null>(null);
  // A hover never replaces a pinned point; hover end only clears a hover. A scrub
  // (the finger on the chart) replaces anything, and a hover end leaves it: the
  // compat mouse events a tap synthesises must not blank the readout.
  const setActivePoint = useMemo(
    () => (next: PowerXActivePointUpdate) =>
      setActivePointState((current) => {
        if (next === 'clear') return null;
        if (next === null) return current?.source === 'hover' ? null : current;
        if (next.source === 'hover' && current?.source === 'pinned') return current;
        return next;
      }),
    [],
  );
  return (
    <PowerXSurfaceContext.Provider value>
      <SetCompareTargetContext.Provider value={setTarget}>
        <SetCompareRangeContext.Provider value={setRange}>
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
        </SetCompareRangeContext.Provider>
      </SetCompareTargetContext.Provider>
    </PowerXSurfaceContext.Provider>
  );
}

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
