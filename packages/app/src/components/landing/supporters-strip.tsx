'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { track } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';

export interface SupporterOrg {
  label: string;
  href: string;
}

export interface SupportersStripProps {
  orgs: SupporterOrg[];
  moreHref: string;
  moreLabel?: string;
}

export function SupportersStrip({ orgs, moreHref, moreLabel }: SupportersStripProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {orgs.map((org) => (
          <Link
            key={org.label}
            href={org.href}
            prefetch={false}
            className="max-w-full justify-self-start truncate text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            onClick={(event) =>
              track('supporters_strip_org_clicked', {
                org: org.label,
                placement: placementFor(event.currentTarget),
              })
            }
          >
            {org.label}
          </Link>
        ))}
      </div>

      <div className="flex justify-end" data-testid="supporters-more-row">
        <Link
          href={moreHref}
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          onClick={(event) =>
            track('quote_carousel_see_more_clicked', {
              placement: placementFor(event.currentTarget),
            })
          }
        >
          {moreLabel ?? 'All quotes and supporters'}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
