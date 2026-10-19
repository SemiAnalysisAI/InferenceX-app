'use client';

import { ChevronDownIcon } from 'lucide-react';
import React, { useId, useState } from 'react';

import { cn } from '@/lib/shared/utils';

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  titleWhenOpen?: boolean;
  onToggle?: (open: boolean) => void;
  toggleLabel: string;
  testId?: string;
  className?: string;
}

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
