'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const SLOT = '[data-theme-toggles]';

/**
 * Renders an optional theme's sound controls into the header's toggle slots. Import this only
 * from a lazily loaded theme module so the header itself carries no per-theme code.
 */
export function ThemeHeaderToggles({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Element[]>([]);

  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const sync = () => {
      const next = [...header.querySelectorAll(SLOT)];
      setSlots((current) =>
        current.length === next.length && current.every((slot, index) => slot === next[index])
          ? current
          : next,
      );
    };
    sync();
    // The mobile slot exists only while the menu is open.
    const observer = new MutationObserver(sync);
    observer.observe(header, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return slots.map((slot) => createPortal(children, slot));
}
