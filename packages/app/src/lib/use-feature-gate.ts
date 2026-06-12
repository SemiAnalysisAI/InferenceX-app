'use client';

import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';

export const FEATURE_GATE_KEY = 'inferencex-feature-gate';
export const FEATURE_GATE_UNLOCKED_EVENT = 'inferencex:feature-gate:unlocked';
export const FEATURE_GATE_LOCKED_EVENT = 'inferencex:feature-gate:locked';

const UNLOCK_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];

/**
 * Konami-style ↑↑↓↓ unlock for hidden features. State persists in
 * localStorage and is shared across components via custom DOM events
 * (FEATURE_GATE_UNLOCKED_EVENT / FEATURE_GATE_LOCKED_EVENT) so all
 * consumers flip together without each owning a keyboard listener.
 *
 * Used by tab-nav (GATED_TABS), gpu-power, submissions, feedback,
 * and any chart surface that should be visible only to insiders
 * until the underlying data is stable.
 */
/**
 * Re-lock the feature gate from any client surface. Owns the localStorage write
 * and the cross-component event dispatch so callers don't need to know the
 * key/event-name strings (which used to drift across three call sites).
 */
export function relockFeatureGate(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FEATURE_GATE_KEY);
  window.dispatchEvent(new Event(FEATURE_GATE_LOCKED_EVENT));
}

export function useFeatureGate(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  const sequenceRef = useRef<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(FEATURE_GATE_KEY) === '1') {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      sequenceRef.current.push(e.key);
      if (sequenceRef.current.length > UNLOCK_SEQUENCE.length) {
        sequenceRef.current = sequenceRef.current.slice(-UNLOCK_SEQUENCE.length);
      }
      if (
        sequenceRef.current.length === UNLOCK_SEQUENCE.length &&
        sequenceRef.current.every((k, i) => k === UNLOCK_SEQUENCE[i])
      ) {
        localStorage.setItem(FEATURE_GATE_KEY, '1');
        setUnlocked(true);
        window.dispatchEvent(new Event(FEATURE_GATE_UNLOCKED_EVENT));
        track('feature_gate_unlocked');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unlocked]);

  useEffect(() => {
    const handleLock = () => setUnlocked(false);
    const handleUnlock = () => setUnlocked(true);
    window.addEventListener(FEATURE_GATE_LOCKED_EVENT, handleLock);
    window.addEventListener(FEATURE_GATE_UNLOCKED_EVENT, handleUnlock);
    return () => {
      window.removeEventListener(FEATURE_GATE_LOCKED_EVENT, handleLock);
      window.removeEventListener(FEATURE_GATE_UNLOCKED_EVENT, handleUnlock);
    };
  }, []);

  return unlocked;
}
