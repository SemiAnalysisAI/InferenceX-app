'use client';

import { useId, useState, type ReactNode } from 'react';

import { DisclosureToggle } from '@/components/ui/disclosure-toggle';
import { track } from '@/lib/analytics/analytics';

/** uBenchX methodology notes, collapsed by default under a "Methodology" toggle. */
export function MethodologyFold({
  title,
  testId,
  children,
}: {
  title: string;
  /** Identifies the test in analytics and tests, e.g. `ubenchx`, `sm-l2`. */
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className="pt-1.5" data-testid={`${testId}-methodology`}>
      <DisclosureToggle
        open={open}
        aria-controls={bodyId}
        data-testid={`${testId}-methodology-toggle`}
        className="text-xs font-medium"
        onClick={() => {
          setOpen((prev) => !prev);
          track('ubenchx_methodology_toggled', { enabled: !open, test: testId });
        }}
      >
        {title}
      </DisclosureToggle>
      {open && (
        <div id={bodyId} className="mt-1.5 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}
