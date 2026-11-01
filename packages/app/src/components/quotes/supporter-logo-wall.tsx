'use client';

import { eyebrowVariants } from '@/components/ui/eyebrow';
import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';

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

// Logos keep their brand colors in both themes; the light tile keeps dark
// wordmarks (OpenAI, Lambda, AMD, ...) legible on the dark card background.
const TILE =
  'flex h-12 w-24 shrink-0 items-center justify-center rounded-md bg-white px-2 ring-1 ring-black/10 sm:w-28 md:w-21 dark:ring-white/10';
const IMG = 'max-h-7 max-w-full object-contain';

function scrollToOrg(org: string) {
  document
    .querySelector(`#${orgAnchorId(org)}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function LogoTile({ item, jumpTo }: { item: WallLogo; jumpTo: (org: string) => string }) {
  const img = (
    <img src={`/logos/${item.logo}`} alt={item.label} width={96} height={28} className={IMG} />
  );
  const { quoteOrg } = item;
  if (!quoteOrg) {
    return (
      <li className={TILE} title={item.label}>
        {img}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          track('quotes_logo_clicked', { org: quoteOrg });
          scrollToOrg(quoteOrg);
        }}
        className={`${TILE} cursor-pointer transition-shadow hover:ring-2 hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
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
  groups = SUPPORTER_GROUPS,
}: {
  locale?: Locale;
  groups?: readonly SupporterGroup[];
}) {
  const t = STRINGS[locale];
  return (
    <section aria-labelledby="supporter-wall-heading" data-testid="supporter-logo-wall">
      <h2 id="supporter-wall-heading" className="text-lg font-semibold text-balance">
        {t.heading}
      </h2>
      <div className="mt-4 flex flex-col gap-5 md:gap-4">
        {groups.map((group) => {
          const labelId = `supporter-group-${group.id}`;
          return (
            <div
              key={group.id}
              data-testid={labelId}
              className="flex flex-col gap-2 md:grid md:grid-cols-[11rem_1fr] md:items-center md:gap-4"
            >
              <h3 id={labelId} className={eyebrowVariants({ className: 'leading-snug' })}>
                {group.label[locale]}
              </h3>
              <ul aria-labelledby={labelId} className="flex flex-wrap gap-2">
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
