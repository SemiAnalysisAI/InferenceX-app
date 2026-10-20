'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

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
    <div
      className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap"
      data-testid="hardware-hero-links"
    >
      {links.map((link, position) => {
        const primary = position === 0;
        const external = isExternalHref(link.href);
        const Icon = external ? ArrowUpRight : ArrowRight;
        const onClick = () =>
          track('hardware_hero_link_clicked', { slug, href: link.href, position });
        const label = (
          <>
            {link.label}
            <Icon aria-hidden="true" />
          </>
        );
        return (
          <Button
            key={`${link.href}-${link.label}`}
            asChild
            size="lg"
            variant={primary ? 'default' : 'outline'}
            className={primary ? 'bg-brand text-primary-foreground hover:bg-brand/90' : undefined}
          >
            {external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="hardware-hero-link"
                onClick={onClick}
              >
                {label}
              </a>
            ) : (
              <Link href={link.href} data-testid="hardware-hero-link" onClick={onClick}>
                {label}
              </Link>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export function HardwareNoteLink({ slug, link }: { slug: string; link: HardwareLink }) {
  const className = 'font-medium text-brand underline-offset-2 hover:underline';
  const onClick = () => track('hardware_note_link_clicked', { slug, href: link.href });
  return isExternalHref(link.href) ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {link.label}
    </a>
  ) : (
    <Link href={link.href} className={className} onClick={onClick}>
      {link.label}
    </Link>
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
