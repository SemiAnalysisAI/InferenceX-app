'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Small (i) icon that shows a tooltip on hover/focus.
 * Renders the tooltip via portal so it's never clipped by parent overflow/z-index.
 */
export function InfoTooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ left: rect.left + rect.width / 2, top: rect.bottom + 6 });
  }, [open]);

  return (
    <>
      <span
        ref={ref}
        className="inline-flex items-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        role="note"
      >
        <Info className="size-3 text-subtle hover:text-muted-foreground transition-colors cursor-help" />
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            style={{ left: pos.left, top: pos.top }}
            className="fixed z-[9999] -translate-x-1/2 max-w-72 rounded-md border border-border bg-popover p-3 shadow-md text-sm text-popover-foreground leading-relaxed pointer-events-none"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
