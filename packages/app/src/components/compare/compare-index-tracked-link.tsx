'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

interface CompareIndexTrackedLinkProps extends React.ComponentProps<typeof Link> {
  analyticsEvent:
    | 'compare_agentx_overview_clicked'
    | 'compare_agentx_dashboard_clicked'
    | 'compare_agentx_methodology_clicked'
    | 'compare_agentx_model_clicked';
  analyticsTarget?: string;
  /** Which page rendered the hero, so `/compare` and `/` clicks stay separable. */
  analyticsSurface?: string;
}

export function CompareIndexTrackedLink({
  analyticsEvent,
  analyticsTarget,
  analyticsSurface,
  onClick,
  ...props
}: CompareIndexTrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        const payload = {
          ...(analyticsTarget ? { target: analyticsTarget } : {}),
          ...(analyticsSurface ? { surface: analyticsSurface } : {}),
        };
        track(analyticsEvent, Object.keys(payload).length > 0 ? payload : undefined);
      }}
    />
  );
}
