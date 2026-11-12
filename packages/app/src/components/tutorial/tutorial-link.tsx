'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics/analytics';

interface TutorialLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  href: string;
  analyticsEvent: string;
  analyticsTarget?: string;
}

export function TutorialLink({
  href,
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: TutorialLinkProps) {
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
