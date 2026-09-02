'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';

interface CatalogLinkCardProps {
  href: string;
  title: string;
  description?: string;
  eyebrow?: string;
  slug: string;
  locale: Locale;
  event: 'run_index_entry_clicked' | 'ranking_index_entry_clicked' | 'chip_index_entry_clicked';
}

/** A scan-friendly, keyboard-visible link used by public catalog indexes. */
export function CatalogLinkCard({
  href,
  title,
  description,
  eyebrow,
  slug,
  locale,
  event,
}: CatalogLinkCardProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border/50 bg-background/30 px-4 py-3 transition-[border-color,background-color,box-shadow] hover:border-brand/45 hover:bg-brand/5 hover:shadow-sm focus-visible:outline-none"
      onClick={() => track(event, { slug, locale })}
    >
      <span className="min-w-0">
        {eyebrow && (
          <span className="mb-0.5 block text-2xs font-semibold tracking-eyebrow text-muted-foreground uppercase">
            {eyebrow}
          </span>
        )}
        <span className="block break-words text-sm font-medium text-foreground transition-colors group-hover:text-brand">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block break-words text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}
