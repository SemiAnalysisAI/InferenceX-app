'use client';

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
      <div className="flex flex-wrap justify-center gap-x-6 md:gap-x-8 gap-y-2 mx-4">
        {orgs.map((org) => (
          <Link
            key={org.label}
            href={org.href}
            prefetch={false}
            className="text-xs font-semibold tracking-wide uppercase text-[#808488] transition-colors duration-200 hover:text-foreground hover:underline"
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
          className="text-xs font-bold text-brand hover:underline"
          onClick={(event) =>
            track('quote_carousel_see_more_clicked', {
              placement: placementFor(event.currentTarget),
            })
          }
        >
          {moreLabel ?? 'See full quotes & more supporters →'}
        </Link>
      </div>
    </div>
  );
}
