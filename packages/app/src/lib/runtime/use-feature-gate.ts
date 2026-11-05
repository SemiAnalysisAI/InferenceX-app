'use client';

import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';

// A new key deliberately invalidates every unlock granted by the old four-arrow code.
export const FEATURE_GATE_KEY = 'inferencex-feature-gate-konami-v1';
export const FEATURE_GATE_UNLOCKED_EVENT = 'inferencex:feature-gate:unlocked';
export const FEATURE_GATE_LOCKED_EVENT = 'inferencex:feature-gate:locked';

const UNLOCK_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'B',
  'A',
];

export function relockFeatureGate(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FEATURE_GATE_KEY);
  window.dispatchEvent(new Event(FEATURE_GATE_LOCKED_EVENT));
}

export function useFeatureGate(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  const sequenceRef = useRef<string[]>([]);

  useEffect(() => {
    localStorage.removeItem('inferencex-feature-gate');
    if (typeof window !== 'undefined' && localStorage.getItem(FEATURE_GATE_KEY) === '1') {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (unlocked) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Let Shift or Caps Lock produce uppercase letters without interrupting the code.
      if (e.repeat || e.key === 'Shift' || e.key === 'CapsLock') return;
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
    const handleLock = () => {
      sequenceRef.current = [];
      setUnlocked(false);
    };
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
