import { ArrowRight } from 'lucide-react';

import { BLOG_COPY } from '@/components/blog/blog-copy';
import { JsonLd } from '@/components/seo/json-ld';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import { formatBlogDate } from '@/lib/blog/blog';
import {
  buildHardwareIndexJsonLd,
  getAllHardwarePages,
  hardwarePagePath,
} from '@/lib/hardware/hardware';
import { HARDWARE_COPY } from '@/lib/hardware/hardware-copy';
import type { Locale } from '@/lib/i18n/i18n';

import { HardwareLede } from './hardware-hero';
import { HardwareCardLink } from './hardware-links';

export function HardwareIndexContent({ locale }: { locale: Locale }) {
  const t = HARDWARE_COPY[locale];
  const blog = BLOG_COPY[locale];
  const pages = getAllHardwarePages(locale);

  return (
    <main className="relative" data-testid="hardware-index-page">
      <JsonLd data={buildHardwareIndexJsonLd(pages, locale)} />
      <div className="container mx-auto flex flex-col gap-8 px-4 pb-16 lg:gap-10 lg:px-8">
        <header className="flex flex-col gap-3 pt-8 md:pt-12">
          <Eyebrow as="p">{t.indexEyebrow}</Eyebrow>
          <Heading as="h1" level="page" className="text-balance">
            {t.indexHeading}
          </Heading>
          <p className="max-w-prose text-base text-muted-foreground lg:text-lg">{t.indexIntro}</p>
        </header>

        {pages.length === 0 ? (
          <p className="text-muted-foreground">{t.indexEmpty}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2" data-testid="hardware-card-grid">
            {pages.map((page) => (
              <article
                key={page.slug}
                className="group relative flex min-w-0 flex-col gap-4 rounded-xl border border-border/30 bg-card p-5 transition-colors hover:border-border md:p-6"
                data-testid="hardware-card"
              >
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <time dateTime={page.date}>{formatBlogDate(page.date, locale)}</time>
                  <span aria-hidden="true">&middot;</span>
                  <span>{blog.readingTime(page.readingTime)}</span>
                </p>
                <Heading
                  as="h2"
                  level="card"
                  className="text-balance text-lg leading-snug lg:text-xl"
                >
                  <HardwareCardLink
                    slug={page.slug}
                    href={hardwarePagePath(page.slug, locale)}
                    title={page.title}
                  />
                </Heading>
                <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
                  <HardwareLede lede={page.lede} />
                </p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand">
                  {t.readResults}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
