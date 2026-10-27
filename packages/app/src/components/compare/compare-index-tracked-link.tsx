'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { operatorXComparisonQuery } from '@/hooks/api/use-operatorx';

import { track } from '@/lib/analytics/analytics';
import { navigateInApp } from '@/lib/routing/client-navigation';

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

interface CompareIndexTrackedLinkProps extends React.ComponentProps<typeof Link> {
  analyticsEvent:
    | 'compare_agentx_revenue_calculator_clicked'
    | 'compare_agentx_dashboard_clicked'
    | 'compare_agentx_model_clicked'
    | 'landing_huawei_results_clicked'
    | 'landing_minimax_m31_flash_results_clicked'
    | 'landing_tpu_results_clicked'
    | 'landing_rubin_results_clicked'
    | 'landing_jalapeno_results_clicked';
  analyticsTarget?: string;
  analyticsSurface?: string;
  appNavigation?: boolean;
  prefetchOperatorX?: boolean;
}

export function CompareIndexTrackedLink({
  analyticsEvent,
  analyticsTarget,
  analyticsSurface,
  appNavigation = false,
  prefetchOperatorX = false,
  onMouseEnter,
  onFocus,
  onClick,
  ...props
}: CompareIndexTrackedLinkProps) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const queryClient = useQueryClient();
  const prefetch = () => {
    if (!prefetchOperatorX || typeof props.href !== 'string') return;
    router.prefetch(props.href);
    void queryClient.prefetchQuery(operatorXComparisonQuery('gemm', null, null));
  };

  return (
    <Link
      {...props}
      data-prefetch-ready={prefetchOperatorX && hydrated ? true : undefined}
      prefetch={prefetchOperatorX ? false : props.prefetch}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
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
