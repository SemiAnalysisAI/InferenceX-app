import { useEffect, useState, useSyncExternalStore } from 'react';

import type { NudgeDefinition } from './types';

export const NUDGE_SLOTS = {
  inferenceLegend: 'inference-legend',
  evaluationTable: 'evaluation-table',
} as const;

export type NudgeSlot = (typeof NUDGE_SLOTS)[keyof typeof NUDGE_SLOTS];

export const NUDGE_SLOT_MOUNTED_EVENT = 'inferencex:nudge-slot-mounted';

export interface InlineNudgeEntry {
  def: NudgeDefinition;
  onDismiss: () => void;
  onAction: () => void;
}

const slotOwners = new Map<string, symbol[]>();
const entries = new Map<string, InlineNudgeEntry>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isNudgeSlotMounted(slot: string): boolean {
  return (slotOwners.get(slot)?.length ?? 0) > 0;
}

export function setInlineNudge(slot: string, entry: InlineNudgeEntry | null): void {
  if (entry) entries.set(slot, entry);
  else entries.delete(slot);
  emit();
}

export function useInlineNudge(slot: NudgeSlot): InlineNudgeEntry | null {
  const [owner] = useState(() => Symbol(slot));

  useEffect(() => {
    slotOwners.set(slot, [...(slotOwners.get(slot) ?? []), owner]);
    emit();
    window.dispatchEvent(new Event(NUDGE_SLOT_MOUNTED_EVENT));
    return () => {
      const remaining = (slotOwners.get(slot) ?? []).filter((entry) => entry !== owner);
      if (remaining.length > 0) slotOwners.set(slot, remaining);
      else slotOwners.delete(slot);
      emit();
    };
  }, [slot, owner]);

  return useSyncExternalStore(
    subscribe,
    () => (slotOwners.get(slot)?.[0] === owner ? (entries.get(slot) ?? null) : null),
    () => null,
  );
}
