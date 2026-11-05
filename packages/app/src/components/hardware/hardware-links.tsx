'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/analytics';
import { type HardwareLink, isExternalHref } from '@/lib/hardware/hardware-markup';

export function HardwareHeroLinks({
  slug,
  links,
}: {
  slug: string;
  links: readonly HardwareLink[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3" data-testid="hardware-hero-links">
      {links.map((link, position) => {
        const primary = position === 0;
        const external = isExternalHref(link.href);
        const Icon = external ? ArrowUpRight : ArrowRight;
        const anchorProps = {
          className: primary
            ? undefined
            : 'inline-flex items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline',
          'data-testid': 'hardware-hero-link',
          onClick: () => track('hardware_hero_link_clicked', { slug, href: link.href, position }),
        };
        const label = (
          <>
            {link.label}
            <Icon aria-hidden="true" className="size-4" />
          </>
        );
        const anchor = external ? (
          <a href={link.href} target="_blank" rel="noopener noreferrer" {...anchorProps}>
            {label}
          </a>
        ) : (
          <Link href={link.href} {...anchorProps}>
            {label}
          </Link>
        );
        return primary ? (
          <Button
            key={link.href}
            asChild
            size="lg"
            className="bg-brand text-primary-foreground hover:bg-brand/90"
          >
            {anchor}
          </Button>
        ) : (
          <Fragment key={link.href}>{anchor}</Fragment>
        );
      })}
    </div>
  );
}

export function HardwareIndexLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="font-medium text-brand hover:underline"
      onClick={() => track('hardware_back_clicked')}
    >
      {label}
    </Link>
  );
}

export function HardwareCardLink({
  slug,
  href,
  title,
}: {
  slug: string;
  href: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="focus-visible:outline-none before:absolute before:inset-0 before:rounded-2xl before:content-['']"
      onClick={() => track('hardware_card_clicked', { slug, title })}
    >
      {title}
    </Link>
  );
}
