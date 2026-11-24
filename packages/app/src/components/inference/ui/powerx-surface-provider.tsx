'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { readUrlParams, writeUrlParams } from '@/lib/routing/url-state';

import {
  parsePowerXCompareAt,
  POWERX_COMPARE_AT_DEFAULT,
  resolvePowerXCompareAt,
  serializePowerXCompareAt,
} from '../powerx/powerx-compare-at';
import {
  ActivePointContext,
  CompareTargetContext,
  IncludeFacilityContext,
  PowerXSurfaceContext,
  SetActivePointContext,
  SetCompareRangeContext,
  SetCompareTargetContext,
  SetIncludeFacilityContext,
  type PowerXActivePoint,
  type PowerXActivePointUpdate,
} from './powerx-surface';

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
