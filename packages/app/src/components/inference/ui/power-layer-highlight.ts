'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import type { PowerLayerHighlight, SystemPowerCategory } from '../utils/power-breakdown';

export interface PowerLayerHighlightControls {
  highlight: PowerLayerHighlight | null;
  /** Hover start (`category`) or end (`null`); ignored while a layer is pinned. */
  hover: (category: SystemPowerCategory | null) => void;
  /** Pins the layer, or unpins it when it is the pinned one. */
  togglePin: (category: SystemPowerCategory) => void;
  /** Drops a pinned layer (Escape, plot background). A plain hover is left alone. */
  unpin: () => void;
}

/**
 * Which breakdown part the viewer is telling apart, shared by the legend, the
 * stacked plot and the chip comparison so hovering "NICs" anywhere lights the
 * NICs layer everywhere. Controlled when the Where view lifts the state above
 * both panels; otherwise the panel keeps its own. Escape unpins.
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
    (category: SystemPowerCategory | null) => {
      if (highlight?.pinned) return;
      if (category === null) {
        if (highlight !== null) set(null);
        return;
      }
      if (highlight?.category === category) return;
      set({ category, pinned: false });
      track('powerx_breakdown_layer_highlighted', { category, pinned: false });
    },
    [highlight, set],
  );
  const togglePin = useCallback(
    (category: SystemPowerCategory) => {
      if (highlight?.pinned && highlight.category === category) {
        set(null);
        return;
      }
      set({ category, pinned: true });
      track('powerx_breakdown_layer_highlighted', { category, pinned: true });
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
