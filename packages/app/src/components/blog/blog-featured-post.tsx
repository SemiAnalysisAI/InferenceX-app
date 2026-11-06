'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { BlogGridTexture, BlogThumbnail } from '@/components/blog/blog-thumbnail';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import { track } from '@/lib/analytics/analytics';
import type { PostThumbnail } from '@/lib/blog/blog';
import { blogTagLabel } from '@/lib/blog/blog-tag-label';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

export interface BlogFeaturedPostProps {
  slug: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  date: string;
  readingLabel: string;
  tags?: string[];
  locale?: Locale;
  thumbnail: PostThumbnail | null;
  basePath?: string;
  labels: { eyebrow: string; read: string; tags: string };
}

const MAX_TAGS = 4;

export function BlogFeaturedPost({
  slug,
  title,
  subtitle,
  dateLabel,
  date,
  readingLabel,
  tags = [],
  locale = 'en',
  thumbnail,
  basePath = '/blog',
  labels,
}: BlogFeaturedPostProps) {
  const href = `${basePath}/${slug}`;
  const onClick = () => track('blog_post_clicked', { slug, title, placement: 'featured' });
  return (
    <article
      data-testid="blog-featured-post"
      data-layout={thumbnail ? 'figure' : 'text'}
      className={cn(
        'group relative min-w-0 overflow-hidden rounded-xl border border-border/30 bg-card p-5 transition-colors hover:border-border md:p-6 lg:p-8',
        thumbnail
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10'
          : 'flex flex-col md:px-8 md:py-8 lg:px-10 lg:py-10',
      )}
    >
      {thumbnail ? (
        <BlogThumbnail
          thumbnail={thumbnail}
          priority
          variant="card"
          className="rounded-lg border border-border/30 lg:aspect-auto"
        />
      ) : (
        <BlogGridTexture variant="card" />
      )}
      <div
        className={cn('flex min-w-0 flex-col gap-4', thumbnail ? 'lg:justify-center' : 'max-w-4xl')}
      >
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Eyebrow>{labels.eyebrow}</Eyebrow>
          <span aria-hidden="true">&middot;</span>
          <time dateTime={date}>{dateLabel}</time>
          <span aria-hidden="true">&middot;</span>
          <span>{readingLabel}</span>
        </p>
        <Heading
          as="h2"
          level="title"
          className="text-2xl leading-tight text-balance group-hover:text-brand md:text-title"
        >
          <Link
            href={href}
            className="focus-visible:outline-none before:absolute before:inset-0 before:z-10 before:content-['']"
            onClick={onClick}
          >
            {title}
          </Link>
        </Heading>
        <p
          className={cn(
            'text-base leading-7 text-muted-foreground',
            !thumbnail && 'max-w-3xl lg:text-lg lg:leading-8',
          )}
        >
          {subtitle}
        </p>
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={labels.tags}>
            {tags.slice(0, MAX_TAGS).map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{blogTagLabel(tag, locale)}</Badge>
              </li>
            ))}
          </ul>
        )}
        <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-brand">
          {labels.read}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </article>
  );
}
