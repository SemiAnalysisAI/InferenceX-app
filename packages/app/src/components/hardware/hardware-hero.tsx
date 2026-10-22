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
import { ledeSegments } from '@/lib/hardware/hardware-markup';
import type { Locale } from '@/lib/i18n/i18n';

import { HardwareHeroLinks, HardwareIndexLink } from './hardware-links';

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
      className="flex flex-col gap-5 border-b border-border/40 pb-8 pt-4 lg:pb-10 lg:pt-8"
      data-testid="hardware-hero"
    >
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
      <div className="flex max-w-4xl flex-col gap-4">
        <Heading
          as="h1"
          level="display"
          className="text-3xl leading-tight md:text-4xl lg:text-5xl lg:leading-[1.08]"
        >
          {meta.title}
        </Heading>
        <p
          className="max-w-prose text-lg leading-7 text-muted-foreground"
          data-testid="hardware-lede"
        >
          <HardwareLede lede={meta.lede} />
        </p>
      </div>
      <HardwareHeroLinks slug={meta.slug} links={meta.links} />
    </header>
  );
}
