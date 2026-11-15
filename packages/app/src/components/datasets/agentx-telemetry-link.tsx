'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';

import { track } from '@/lib/analytics/analytics';

interface AgentXTelemetryLinkProps extends Omit<
  React.ComponentProps<typeof IntentPrefetchLink>,
  'href'
> {
  href: string;
  analyticsEvent:
    | 'agentx_telemetry_opened'
    | 'agentx_telemetry_returned'
    | 'agentx_telemetry_figure_opened'
    | 'agentx_telemetry_results_opened';
  analyticsTarget?: string;
}

export function AgentXTelemetryLink({
  href,
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: AgentXTelemetryLinkProps) {
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
