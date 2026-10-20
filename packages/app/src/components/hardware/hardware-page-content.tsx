import type { ReactNode } from 'react';

import { BLOG_COPY } from '@/components/blog/blog-copy';
import { BLOG_PROSE_CLASS } from '@/components/blog/blog-prose';
import { BlogToc } from '@/components/blog/blog-toc';
import { HashScroll } from '@/components/blog/hash-scroll';
import type { TocHeading } from '@/lib/blog/blog';
import type { HardwarePageMeta } from '@/lib/hardware/hardware';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

import { HardwareHero, HardwareNote } from './hardware-hero';

const HARDWARE_PROSE_CLASS = cn(
  BLOG_PROSE_CLASS,
  'hardware-prose',
  'prose-p:my-4 prose-p:max-w-[76ch] prose-p:leading-relaxed',
  'prose-ul:my-4 prose-ul:max-w-[76ch] prose-ol:my-4 prose-ol:max-w-[76ch] prose-li:my-1 prose-li:leading-relaxed',
  'prose-headings:max-w-[76ch]',
  'prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-xl md:prose-h2:text-2xl',
  'prose-h3:mt-8 prose-h3:mb-2 prose-h3:text-lg',
  'prose-table:my-5 prose-td:tabular-nums [&_td:first-child]:whitespace-nowrap',
);

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
      <div className="container mx-auto flex flex-col gap-4 px-4 pb-16 pt-4 lg:px-8 lg:pt-6">
        <HardwareHero meta={meta} locale={locale} />
        <HardwareNote note={meta.note} slug={meta.slug} locale={locale} />

        <div
          className={cn(
            'mt-2 grid gap-8 lg:mt-4',
            hasToc && 'lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12 xl:gap-16',
          )}
        >
          <div className="flex min-w-0 flex-col gap-6">
            {hasToc && (
              <BlogToc headings={headings} locale={locale} variant="inline" className="lg:hidden" />
            )}
            <article className={HARDWARE_PROSE_CLASS} data-testid="hardware-article">
              {content}
              <p className="mt-10 max-w-[76ch] border-t border-border/40 pt-5 text-xs leading-5 text-muted-foreground">
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
