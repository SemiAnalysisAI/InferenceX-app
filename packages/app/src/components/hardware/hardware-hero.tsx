import { Info } from 'lucide-react';
import Link from 'next/link';

import { BLOG_COPY } from '@/components/blog/blog-copy';
import { Heading } from '@/components/ui/heading';
import { formatBlogDate } from '@/lib/blog/blog';
import {
  type HardwarePageMeta,
  hardwareIndexPath,
  hardwarePagePath,
} from '@/lib/hardware/hardware';
import { HARDWARE_COPY } from '@/lib/hardware/hardware-copy';
import { ledeSegments, noteParts } from '@/lib/hardware/hardware-markup';
import type { Locale } from '@/lib/i18n/i18n';

import { HardwareHeroLinks, HardwareIndexLink, HardwareNoteLink } from './hardware-links';

export function HardwareLede({ lede }: { lede: string }) {
  return ledeSegments(lede).map((segment) =>
    segment.strong ? (
      <strong key={segment.start} className="font-semibold text-foreground">
        {segment.text}
      </strong>
    ) : (
      segment.text
    ),
  );
}

export function HardwareHero({ meta, locale }: { meta: HardwarePageMeta; locale: Locale }) {
  const t = HARDWARE_COPY[locale];
  const blog = BLOG_COPY[locale];

  return (
    <header
      className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-[2px]"
      data-testid="hardware-hero"
    >
      <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:gap-10 lg:p-9 xl:gap-14">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <HardwareIndexLink href={hardwareIndexPath(locale)} label={t.indexTitle} />
            <span aria-hidden="true">&middot;</span>
            <time dateTime={meta.date}>{formatBlogDate(meta.date, locale)}</time>
            <span aria-hidden="true">&middot;</span>
            <span>{blog.readingTime(meta.readingTime)}</span>
            {locale === 'zh' && (
              <>
                <span aria-hidden="true">&middot;</span>
                <Link
                  href={hardwarePagePath(meta.slug)}
                  hrefLang="en"
                  className="text-brand hover:underline"
                >
                  {blog.readOriginal}
                </Link>
              </>
            )}
          </p>
          <Heading
            as="h1"
            level="display"
            className="text-2xl leading-tight sm:text-3xl md:text-4xl lg:leading-[1.12]"
          >
            {meta.title}
          </Heading>
          <p
            className="text-base leading-relaxed text-muted-foreground md:text-lg md:leading-8"
            data-testid="hardware-lede"
          >
            <HardwareLede lede={meta.lede} />
          </p>
          <div className="pt-1">
            <HardwareHeroLinks slug={meta.slug} links={meta.links} />
          </div>
        </div>

        <section
          aria-labelledby="hardware-highlights-title"
          className="flex min-w-0 flex-col gap-3 lg:pt-1"
          data-testid="hardware-highlights"
        >
          <h2
            id="hardware-highlights-title"
            className="text-sm font-semibold leading-snug text-muted-foreground"
          >
            {meta.highlightsTitle}
          </h2>
          <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
            {meta.highlights.map((highlight) => (
              <li
                key={`${highlight.label}-${highlight.detail}`}
                className="flex min-w-0 flex-col gap-1 rounded-xl border border-border/50 bg-background/70 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                data-testid="hardware-highlight"
              >
                <span className="text-2xl font-bold tracking-tight text-brand tabular-nums sm:w-24 sm:shrink-0 sm:text-3xl">
                  {highlight.value}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold leading-snug text-foreground">
                    {highlight.label}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground sm:text-sm">
                    {highlight.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </header>
  );
}

export function HardwareNote({
  note,
  slug,
  locale,
}: {
  note: string;
  slug: string;
  locale: Locale;
}) {
  const { before, link, after } = noteParts(note);
  return (
    <div
      role="note"
      aria-label={HARDWARE_COPY[locale].noteLabel}
      className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card/40 px-4 py-2.5 backdrop-blur-[2px]"
      data-testid="hardware-note"
    >
      <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-brand" />
      <p className="text-sm leading-6 text-muted-foreground">
        {before}
        {link && <HardwareNoteLink slug={slug} link={link} />}
        {after}
      </p>
    </div>
  );
}
