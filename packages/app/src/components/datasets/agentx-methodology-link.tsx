'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

interface AgentXMethodologyLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  href: string;
  analyticsEvent:
    | 'agentx_methodology_opened'
    | 'agentx_methodology_returned'
    | 'agentx_methodology_figure_opened'
    | 'agentx_methodology_source_opened';
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
