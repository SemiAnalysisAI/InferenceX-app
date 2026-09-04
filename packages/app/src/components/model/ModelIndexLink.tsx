'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

import { track } from '@/lib/analytics';
import { navigateInApp } from '@/lib/client-navigation';
import type { Locale } from '@/lib/i18n';

interface ModelIndexLinkProps extends Omit<ComponentProps<typeof Link>, 'href'> {
  href: string;
  slug: string;
  locale: Locale;
}

/**
 * Model detail routes are generated from MDX. Use the shared same-document
 * navigation path already used by dashboard entry links, so background audio
 * and layout state survive the transition.
 */
export function ModelIndexLink({ href, slug, locale, onClick, ...props }: ModelIndexLinkProps) {
  const router = useRouter();

  return (
    <Link
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
