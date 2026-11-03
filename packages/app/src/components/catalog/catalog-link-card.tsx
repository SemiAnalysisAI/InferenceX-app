'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

interface CatalogLinkCardProps {
  href: string;
  title: string;
  description?: string;
  eyebrow?: string;
  slug: string;
  locale: Locale;
  event: 'run_index_entry_clicked' | 'ranking_index_entry_clicked' | 'chip_index_entry_clicked';
}

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
    <IntentPrefetchLink
      href={href}
      className={cn(
        'group flex min-h-14 justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        description ? 'items-start' : 'items-center',
      )}
      onClick={() => track(event, { slug, locale })}
    >
      <span className="min-w-0">
        {eyebrow && <span className="mb-0.5 block text-xs text-muted-foreground">{eyebrow}</span>}
        <span className="block break-words text-sm font-medium text-foreground">{title}</span>
        {description && (
          <span className="mt-0.5 block break-words text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <ArrowRight
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground',
          description && 'mt-0.5',
        )}
      />
    </IntentPrefetchLink>
  );
}
