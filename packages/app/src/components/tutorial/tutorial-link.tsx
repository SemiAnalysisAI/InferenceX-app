'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';

import { track } from '@/lib/analytics/analytics';

interface TutorialLinkProps extends Omit<React.ComponentProps<typeof IntentPrefetchLink>, 'href'> {
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
