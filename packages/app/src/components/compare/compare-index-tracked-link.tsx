'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { track } from '@/lib/analytics';
import { navigateInApp } from '@/lib/client-navigation';

interface CompareIndexTrackedLinkProps extends React.ComponentProps<typeof Link> {
  analyticsEvent:
    | 'compare_agentx_revenue_calculator_clicked'
    | 'compare_agentx_dashboard_clicked'
    | 'compare_agentx_model_clicked';
  analyticsTarget?: string;
  /** Which page rendered the hero, so `/compare` and `/` clicks stay separable. */
  analyticsSurface?: string;
  /** Route the click through `navigateInApp`, the way the header nav and the
   *  landing card already do for `/overview` and `/inference`, keeping the
   *  transition same-document so the Minecraft music persists. */
  appNavigation?: boolean;
}

export function CompareIndexTrackedLink({
  analyticsEvent,
  analyticsTarget,
  analyticsSurface,
  appNavigation = false,
  onClick,
  ...props
}: CompareIndexTrackedLinkProps) {
  const router = useRouter();

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
        if (appNavigation && typeof props.href === 'string') {
          navigateInApp(event, router, props.href);
        }
      }}
    />
  );
}
