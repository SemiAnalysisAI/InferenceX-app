'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { NudgeKind } from '@/lib/nudges';

/**
 * Slot manager for kinds that can only host one nudge at a time (modal,
 * banner). Each candidate calls `requestSlot` with its priority; the highest
 * priority requester wins. Toasts coordinate via the existing
 * `inferencex:dismiss-toast` event in BottomToast and don't use the slot.
 */
interface NudgeProviderState {
  requestSlot: (kind: NudgeKind, id: string, priority: number) => boolean;
  releaseSlot: (kind: NudgeKind, id: string) => void;
  isSlotHolder: (kind: NudgeKind, id: string) => boolean;
}

const NudgeContext = createContext<NudgeProviderState | null>(null);

interface SlotState {
  holder: string | null;
  candidates: Map<string, number>;
}

function pickHolder(candidates: Map<string, number>): string | null {
  let bestId: string | null = null;
  let bestPriority = -Infinity;
  for (const [id, priority] of candidates) {
    if (priority > bestPriority) {
      bestPriority = priority;
      bestId = id;
    }
  }
  return bestId;
}

export function NudgeProvider({ children }: { children: ReactNode }) {
  const [, forceRender] = useState(0);
  const slotsRef = useRef<Map<NudgeKind, SlotState>>(new Map());

  const getSlot = useCallback((kind: NudgeKind): SlotState => {
    let slot = slotsRef.current.get(kind);
    if (!slot) {
      slot = { holder: null, candidates: new Map() };
      slotsRef.current.set(kind, slot);
    }
    return slot;
  }, []);

  const requestSlot = useCallback(
    (kind: NudgeKind, id: string, priority: number): boolean => {
      const slot = getSlot(kind);
      slot.candidates.set(id, priority);
      const newHolder = pickHolder(slot.candidates);
      if (newHolder !== slot.holder) {
        slot.holder = newHolder;
        forceRender((n) => n + 1);
      }
      return slot.holder === id;
    },
    [getSlot],
  );

  const releaseSlot = useCallback(
    (kind: NudgeKind, id: string): void => {
      const slot = getSlot(kind);
      slot.candidates.delete(id);
      const newHolder = pickHolder(slot.candidates);
      if (newHolder !== slot.holder) {
        slot.holder = newHolder;
        forceRender((n) => n + 1);
      }
    },
    [getSlot],
  );

  const isSlotHolder = useCallback(
    (kind: NudgeKind, id: string): boolean => getSlot(kind).holder === id,
    [getSlot],
  );

  const value = useMemo<NudgeProviderState>(
    () => ({ requestSlot, releaseSlot, isSlotHolder }),
    [requestSlot, releaseSlot, isSlotHolder],
  );

  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>;
}

export function useNudgeSlot() {
  const ctx = useContext(NudgeContext);
  if (!ctx) {
    throw new Error('useNudgeSlot must be used inside <NudgeProvider>');
  }
  return ctx;
}
