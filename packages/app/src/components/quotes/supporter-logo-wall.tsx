'use client';

import type { CSSProperties } from 'react';

import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';

import { logoSize } from './logo-metrics';
import { orgAnchorId } from './quotes-data';
import { SUPPORTER_GROUPS, type SupporterGroup, type WallLogo } from './supporter-groups';

const STRINGS = {
  en: {
    heading: 'Backed by every lab, cloud and OSS project',
    jumpTo: (org: string) => `Jump to ${org}’s quote`,
  },
  zh: {
    heading: '获得各大实验室、云平台与开源项目的支持',
    jumpTo: (org: string) => `查看 ${org} 的评价`,
  },
} as const;

// Phones show three logos per row (five on small tablets) with any short last
// row centered; desktop spreads each group evenly across its row.
// Wordmarks and square marks get a balanced optical size from measured
// geometry (see logo-metrics.ts). Logos sit bare on the page in full color;
// mostly-black artwork flips to light in dark mode with a hue-preserving
// filter so brand accents keep their color family.
const IMG = 'h-[calc(var(--logo-h)*0.85)] w-auto max-w-full object-contain xl:h-(--logo-h)';
const IMG_DARK_INVERT = 'dark:invert dark:hue-rotate-180';
/** Desktop rows never get more columns than this; longer groups wrap. */
const MAX_COLUMNS = 10;

function scrollToOrg(org: string) {
  document
    .querySelector(`#${orgAnchorId(org)}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function LogoTile({ item, jumpTo }: { item: WallLogo; jumpTo: (org: string) => string }) {
  const size = logoSize(item.logo);
  const img = (
    <img
      src={`/logos/${item.logo}`}
      alt={item.label}
      width={size.width}
      height={size.height}
      style={{ '--logo-h': `${size.height}px` } as CSSProperties}
      className={size.invertInDark ? `${IMG} ${IMG_DARK_INVERT}` : IMG}
    />
  );
  const { quoteOrg } = item;
  return (
    <li className="flex h-12 w-1/3 min-w-0 items-center justify-center px-1 sm:w-1/5 lg:h-16 lg:w-auto lg:px-0">
      {quoteOrg ? (
        <button
          type="button"
          onClick={() => {
            track('quotes_logo_clicked', { org: quoteOrg });
            scrollToOrg(quoteOrg);
          }}
          className="flex h-full max-w-full cursor-pointer items-center justify-center rounded-sm px-1 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title={jumpTo(quoteOrg)}
          aria-label={jumpTo(quoteOrg)}
        >
          {img}
        </button>
      ) : (
        <span
          className="flex h-full max-w-full items-center justify-center px-1"
          title={item.label}
        >
          {img}
        </span>
      )}
    </li>
  );
}

export function SupporterLogoWall({
  locale = 'en',
  groups = SUPPORTER_GROUPS,
}: {
  locale?: Locale;
  groups?: readonly SupporterGroup[];
}) {
  const t = STRINGS[locale];
  return (
    <section aria-labelledby="supporter-wall-heading" data-testid="supporter-logo-wall">
      <h2 id="supporter-wall-heading" className="text-lg font-semibold text-balance break-keep">
        {t.heading}
      </h2>
      <div className="mt-6 flex flex-col gap-6 lg:gap-5">
        {groups.map((group) => {
          const labelId = `supporter-group-${group.id}`;
          return (
            <div
              key={group.id}
              data-testid={labelId}
              className="flex flex-col gap-2 lg:grid lg:grid-cols-[12rem_1fr] lg:items-center lg:gap-6"
            >
              <h3 id={labelId} className="text-sm font-bold leading-snug text-brand lg:text-base">
                {group.label[locale]}
              </h3>
              <ul
                aria-labelledby={labelId}
                style={{ '--cols': Math.min(group.logos.length, MAX_COLUMNS) } as CSSProperties}
                className="flex flex-wrap items-center justify-center gap-y-3 lg:grid lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:gap-x-3 lg:gap-y-2"
              >
                {group.logos.map((item) => (
                  <LogoTile key={`${item.label}-${item.logo}`} item={item} jumpTo={t.jumpTo} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
