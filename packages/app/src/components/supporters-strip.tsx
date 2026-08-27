'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

export interface SupportersStripProps {
  /** Display names shown in the org strip, in display order */
  orgs: string[];
  /** Link to the page with all quotes and supporters */
  moreHref: string;
  /** Label for the moreHref link (default "See full quotes & more supporters →") */
  moreLabel?: string;
}

/**
 * Compact replacement for the landing quote carousel: renders the supporter
 * org strip plus a single link out to the full quotes page instead of a
 * rotating quote block, saving vertical space above the fold.
 */
export function SupportersStrip({ orgs, moreHref, moreLabel }: SupportersStripProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Org name strip */}
      <div className="flex flex-wrap justify-center gap-x-6 md:gap-x-8 gap-y-2 mx-4">
        {orgs.map((org) => (
          <span key={org} className="text-xs font-semibold tracking-wide uppercase text-[#808488]">
            {org}
          </span>
        ))}
      </div>

      <div className="flex justify-end" data-testid="supporters-more-row">
        <Link
          href={moreHref}
          prefetch={false}
          className="text-xs font-bold text-brand hover:underline"
          onClick={() => track('quote_carousel_see_more_clicked')}
        >
          {moreLabel ?? 'See full quotes & more supporters →'}
        </Link>
      </div>
    </div>
  );
}
