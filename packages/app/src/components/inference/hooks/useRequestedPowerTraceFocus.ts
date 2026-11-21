'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import {
  clearPowerTraceFocus,
  peekPowerTraceFocus,
} from '@/components/inference/utils/powerTimeline';

/**
 * Trace key a "View power trace" click asked this timeline to focus, or null.
 * The request is read during render but only cleared after commit, so a render
 * React throws away (an interrupted or suspended mount) cannot swallow it.
 * Callers set `current` to null once the focus is applied.
 */
export function useRequestedPowerTraceFocus(): RefObject<string | null> {
  const [requested] = useState(peekPowerTraceFocus);
  const ref = useRef<string | null>(requested);
  useEffect(() => {
    if (requested) clearPowerTraceFocus(requested);
  }, [requested]);
  return ref;
}
