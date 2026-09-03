'use client';

import { ChevronDownIcon } from 'lucide-react';
import React, { useId, useState } from 'react';

import { cn } from '@/lib/utils';

export interface CollapsibleSectionProps {
  /** Section heading. */
  title: string;
  children: React.ReactNode;
  /** Whether the section starts expanded. Uncontrolled from then on. */
  defaultOpen?: boolean;
  /**
   * Set false when the body already carries its own heading — a chart caption,
   * say. The header then shows the title only while the section is folded, so an
   * expanded section never shows the same heading twice.
   */
  titleWhenOpen?: boolean;
  /** Called with the new state on every toggle. Callers use it for analytics. */
  onToggle?: (open: boolean) => void;
  /** Accessible name for the toggle. Localised by the caller. */
  toggleLabel: string;
  testId?: string;
  className?: string;
}

/**
 * A section that folds away behind a chevron.
 *
 * The body is unmounted rather than hidden: these sections hold D3 charts and
 * tables, and leaving them mounted under `display: none` keeps them measuring and
 * re-rendering off-screen for a reader who has said they are not interested.
 * Chart zoom and pinned tooltips do not survive a fold, which is the trade.
 */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  titleWhenOpen = true,
  onToggle,
  toggleLabel,
  testId,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={toggleLabel}
          title={toggleLabel}
          data-testid={testId}
          onClick={() => {
            const next = !open;
            setOpen(next);
            onToggle?.(next);
          }}
          className="text-muted-foreground hover:text-foreground rounded-sm outline-none cursor-pointer"
        >
          <ChevronDownIcon
            className={cn('size-5 transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
        {(open ? titleWhenOpen : true) && <h2 className="text-lg font-semibold">{title}</h2>}
      </div>
      {open && <div id={bodyId}>{children}</div>}
    </div>
  );
}
