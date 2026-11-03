'use client';

import type { CSSProperties } from 'react';

import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';

import { logoSize } from './logo-metrics';
import { orgAnchorId } from './quotes-data';
import type { SupporterGroup, WallLogo } from './supporter-groups';
import { SupporterLogoImage } from './supporter-logo-image';

const STRINGS = {
  en: {
    heading: 'Labs, clouds and open-source projects',
    jumpTo: (org: string) => `Jump to ${org}’s quote`,
  },
  zh: {
    heading: '实验室、云平台与开源项目',
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
    <SupporterLogoImage
      logo={item.logo}
      alt={item.label}
      width={size.width}
      height={size.height}
      style={{ '--logo-h': `${size.height}px` } as CSSProperties}
      className={IMG}
      darkClassName={size.invertInDark ? IMG_DARK_INVERT : undefined}
    />
  );
  const { quoteOrg } = item;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          track('quotes_logo_clicked', { org: quoteOrg });
          scrollToOrg(quoteOrg);
        }}
        className={`${TILE} cursor-pointer transition-shadow hover:ring-foreground/40 focus-visible:outline-none dark:hover:ring-white/50`}
        title={jumpTo(quoteOrg)}
        aria-label={jumpTo(quoteOrg)}
      >
        {img}
      </button>
    </li>
  );
}

export function SupporterLogoWall({
  locale = 'en',
  groups,
}: {
  locale?: Locale;
  groups: readonly SupporterGroup[];
}) {
  const t = STRINGS[locale];
  return (
    <section aria-labelledby="supporter-wall-heading" data-testid="supporter-logo-wall">
      <h2 id="supporter-wall-heading" className="text-xl font-semibold text-balance">
        {t.heading}
      </h2>
      <div className="mt-6 flex flex-col gap-5 md:gap-4">
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
                style={
                  {
                    '--cols': group.desktopColumns ?? Math.min(group.logos.length, MAX_COLUMNS),
                  } as CSSProperties
                }
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
