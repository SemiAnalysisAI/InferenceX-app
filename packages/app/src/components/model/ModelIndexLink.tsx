'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

import { track } from '@/lib/analytics/analytics';
import { navigateInApp } from '@/lib/routing/client-navigation';
import type { Locale } from '@/lib/i18n/i18n';

interface ModelIndexLinkProps extends Omit<ComponentProps<typeof IntentPrefetchLink>, 'href'> {
  href: string;
  slug: string;
  locale: Locale;
}

export function ModelIndexLink({ href, slug, locale, onClick, ...props }: ModelIndexLinkProps) {
  const router = useRouter();

  return (
    <IntentPrefetchLink
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        track('model_index_model_clicked', { slug, locale });
        navigateInApp(event, router, href);
      }}
    />
  );
}
