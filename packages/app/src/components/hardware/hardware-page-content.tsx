import type { ReactNode } from 'react';

import { BLOG_COPY } from '@/components/blog/blog-copy';
import { BLOG_PROSE_CLASS } from '@/components/blog/blog-prose';
import { BlogToc } from '@/components/blog/blog-toc';
import { HashScroll } from '@/components/blog/hash-scroll';
import { READING_PAGE_CLASS } from '@/components/ui/reading-layout';
import type { TocHeading } from '@/lib/blog/blog';
import type { HardwarePageMeta } from '@/lib/hardware/hardware';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

import { HardwareHero } from './hardware-hero';

const HARDWARE_PROSE_CLASS = cn(
  BLOG_PROSE_CLASS,
  'hardware-prose',
  'prose-li:my-1',
  'prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-xl md:prose-h2:text-2xl',
  'prose-h3:mt-8 prose-h3:mb-2 prose-h3:text-lg',
  'prose-table:my-5 prose-td:tabular-nums [&_td:first-child]:whitespace-nowrap',
);

// CJK text has per-character min-content widths, so on phones an auto-width table squeezes
// every column to a character and the rows turn tall. Size zh tables to content in the scroller.
const HARDWARE_PROSE_ZH_CLASS = 'max-md:prose-table:w-max max-md:prose-table:min-w-full';

export interface HardwarePageContentProps {
  locale: Locale;
  meta: HardwarePageMeta;
  headings: TocHeading[];
  content: ReactNode;
}

export function HardwarePageContent({ locale, meta, headings, content }: HardwarePageContentProps) {
  const hasToc = headings.length > 0;

  return (
    <main className="relative" data-testid="hardware-page">
      <HashScroll />
      <div className={cn(READING_PAGE_CLASS, 'flex flex-col gap-8 pb-16 lg:gap-10')}>
        <HardwareHero meta={meta} locale={locale} />

        <div
          className={cn(
            'grid gap-8',
            hasToc && 'lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12 xl:gap-16',
          )}
        >
          <div className="flex min-w-0 flex-col gap-6">
            {hasToc && (
              <BlogToc headings={headings} locale={locale} variant="inline" className="lg:hidden" />
            )}
            <article
              className={cn(HARDWARE_PROSE_CLASS, locale === 'zh' && HARDWARE_PROSE_ZH_CLASS)}
              data-testid="hardware-article"
            >
              {content}
              <p className="mt-10 max-w-measure border-t border-border/40 pt-5 text-xs leading-5 text-muted-foreground">
                {BLOG_COPY[locale].copyright}
              </p>
            </article>
          </div>

          {hasToc && (
            <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
              <BlogToc
                headings={headings}
                locale={locale}
                variant="sidebar"
                sidebarListClassName="max-h-[calc(100vh-10rem)]"
              />
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
