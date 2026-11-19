'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';

import { track } from '@/lib/analytics/analytics';

interface AgentXOptimizationsLinkProps extends Omit<
  React.ComponentProps<typeof IntentPrefetchLink>,
  'href'
> {
  href: string;
  analyticsEvent:
    | 'agentx_optimizations_opened'
    | 'agentx_optimizations_returned'
    | 'agentx_optimizations_framework_opened'
    | 'agentx_optimizations_pr_opened'
    | 'agentx_optimizations_reference_opened'
    | 'agentx_optimizations_figure_opened';
  analyticsTarget?: string;
}

export function AgentXOptimizationsLink({
  href,
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: AgentXOptimizationsLinkProps) {
  return (
    <IntentPrefetchLink
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        track(analyticsEvent, analyticsTarget ? { target: analyticsTarget } : undefined);
      }}
    />
  );
}
