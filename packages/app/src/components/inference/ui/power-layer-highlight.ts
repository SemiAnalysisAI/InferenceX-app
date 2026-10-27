'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import {
  sameLayerTarget,
  type PowerLayerHighlight,
  type PowerLayerTarget,
} from '../utils/power-breakdown';

export interface PowerLayerHighlightControls {
  highlight: PowerLayerHighlight | null;
  /** Hover start (a band, or a part with its band) or end (`null`); ignored while pinned. */
  hover: (target: PowerLayerTarget | null) => void;
  /** Pins the target, or unpins it when it is the pinned one. */
  togglePin: (target: PowerLayerTarget) => void;
  /** Drops a pinned target (Escape, plot background). A plain hover is left alone. */
  unpin: () => void;
}

/**
 * Which breakdown band the viewer is telling apart, shared by the legends,
 * the stacked plot, the chip comparison and the parts list so hovering the
 * modeled band anywhere lights it everywhere. A parts-list row drives it
 * through its component (`partTarget`), which lights the row and raises its
 * band; the plot and the legends drive it by band alone (`bandTarget`).
 * Controlled when the Where view lifts the state above the panels;
 * otherwise the panel keeps its own. Escape unpins.
 */
export function usePowerLayerHighlight(
  controlled?: PowerLayerHighlight | null,
  onChange?: (next: PowerLayerHighlight | null) => void,
): PowerLayerHighlightControls {
  const [own, setOwn] = useState<PowerLayerHighlight | null>(null);
  const highlight = controlled === undefined ? own : controlled;
  const set = useCallback(
    (next: PowerLayerHighlight | null) => {
      setOwn(next);
      onChange?.(next);
    },
    [onChange],
  );
  const hover = useCallback(
    (target: PowerLayerTarget | null) => {
      if (highlight?.pinned) return;
      if (target === null) {
        if (highlight !== null) set(null);
        return;
      }
      if (sameLayerTarget(highlight, target)) return;
      set({ ...target, pinned: false });
      // A part row reports its own event; the plot and the legends report the band.
      if (target.category === null) {
        track('powerx_breakdown_layer_highlighted', { band: target.band, pinned: false });
      }
    },
    [highlight, set],
  );
  const togglePin = useCallback(
    (target: PowerLayerTarget) => {
      if (highlight?.pinned && sameLayerTarget(highlight, target)) {
        set(null);
        return;
      }
      set({ ...target, pinned: true });
      if (target.category === null) {
        track('powerx_breakdown_layer_highlighted', { band: target.band, pinned: true });
      }
    },
    [highlight, set],
  );
  const unpin = useCallback(() => {
    if (highlight?.pinned) set(null);
  }, [highlight, set]);
  const pinned = highlight?.pinned === true;
  useEffect(() => {
    if (!pinned) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') set(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pinned, set]);
  return useMemo(
    () => ({ highlight, hover, togglePin, unpin }),
    [highlight, hover, togglePin, unpin],
  );
}
