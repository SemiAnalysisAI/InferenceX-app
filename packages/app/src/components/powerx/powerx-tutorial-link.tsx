'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics/analytics';

interface PowerXTutorialLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  href: string;
  analyticsEvent: 'powerx_tutorial_returned' | 'powerx_tutorial_section_opened';
  analyticsTarget?: string;
}

export function PowerXTutorialLink({
  href,
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: PowerXTutorialLinkProps) {
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
