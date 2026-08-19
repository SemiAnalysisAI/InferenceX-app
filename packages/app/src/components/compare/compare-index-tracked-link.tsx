'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

interface CompareIndexTrackedLinkProps extends React.ComponentProps<typeof Link> {
  analyticsEvent:
    | 'compare_agentx_dashboard_clicked'
    | 'compare_agentx_methodology_clicked'
    | 'compare_agentx_model_clicked';
  analyticsTarget?: string;
}

export function CompareIndexTrackedLink({
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: CompareIndexTrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        track(analyticsEvent, analyticsTarget ? { target: analyticsTarget } : undefined);
      }}
    />
  );
}
