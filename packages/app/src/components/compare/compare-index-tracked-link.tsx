'use client';

import { useRouter } from 'next/navigation';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { track } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';
import { navigateInApp } from '@/lib/routing/client-navigation';

interface CompareIndexTrackedLinkProps extends React.ComponentProps<typeof IntentPrefetchLink> {
  analyticsEvent:
    | 'compare_agentx_revenue_calculator_clicked'
    | 'compare_agentx_dashboard_clicked'
    | 'compare_agentx_model_clicked'
    | 'landing_huawei_results_clicked'
    | 'landing_trainium_results_clicked'
    | 'landing_tpu_results_clicked'
    | 'landing_rubin_results_clicked'
    | 'landing_jalapeno_results_clicked';
  analyticsTarget?: string;
  analyticsSurface?: string;
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
    <IntentPrefetchLink
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        track(analyticsEvent, {
          ...(analyticsTarget ? { target: analyticsTarget } : {}),
          ...(analyticsSurface ? { surface: analyticsSurface } : {}),
          placement: placementFor(event.currentTarget),
        });
        if (appNavigation && typeof props.href === 'string') {
          navigateInApp(event, router, props.href);
        }
      }}
    />
  );
}
