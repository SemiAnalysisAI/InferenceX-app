'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

/**
 * Analytics-instrumented link for the AgentX telemetry tutorial. The tutorial
 * pages are server components, so every tracked click goes through here.
 */
interface AgentXTelemetryLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
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
    <Link
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
