'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';

import { track } from '@/lib/analytics/analytics';

interface AgentXMethodologyLinkProps extends Omit<
  React.ComponentProps<typeof IntentPrefetchLink>,
  'href'
> {
  href: string;
  analyticsEvent:
    | 'agentx_quickstart_opened'
    | 'agentx_methodology_opened'
    | 'agentx_methodology_returned'
    | 'agentx_methodology_figure_opened'
    | 'agentx_methodology_source_opened'
    | 'agentx_results_opened';
  analyticsTarget?: string;
}

export function AgentXMethodologyLink({
  href,
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: AgentXMethodologyLinkProps) {
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
