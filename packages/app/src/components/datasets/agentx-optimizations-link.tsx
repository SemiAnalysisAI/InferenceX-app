'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

/**
 * Analytics-instrumented link for the AgentX optimizations pages. The pages
 * themselves are server components, so every tracked click goes through here.
 */
interface AgentXOptimizationsLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
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
