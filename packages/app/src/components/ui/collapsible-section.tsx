'use client';

import React, { useId, useState } from 'react';

import { DisclosureToggle } from '@/components/ui/disclosure-toggle';
import { Heading } from '@/components/ui/heading';
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
      <div className={cn('flex items-start', open && 'mb-2')}>
        <DisclosureToggle
          hanging
          open={open}
          aria-controls={bodyId}
          aria-label={toggleLabel}
          title={toggleLabel}
          data-testid={testId}
          onClick={() => {
            const next = !open;
            setOpen(next);
            onToggle?.(next);
          }}
        />
        {(open ? titleWhenOpen : true) && (
          <Heading as="h2" level="card">
            {title}
          </Heading>
        )}
      </div>
      {open && <div id={bodyId}>{children}</div>}
    </div>
  );
}
