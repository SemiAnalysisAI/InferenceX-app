'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { BlogGridTexture, BlogThumbnail } from '@/components/blog/blog-thumbnail';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import { track } from '@/lib/analytics';
import type { PostThumbnail } from '@/lib/blog';
import { cn } from '@/lib/utils';

export interface BlogFeaturedPostProps {
  slug: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  date: string;
  readingLabel: string;
  tags?: string[];
  thumbnail: PostThumbnail | null;
  basePath?: string;
  /** Localized strings: eyebrow ("Latest"), CTA ("Read article"), tag-list label. */
  labels: { eyebrow: string; read: string; tags: string };
}

const MAX_TAGS = 4;

/** Wide two-column card for the newest post at the top of the index. */
export function BlogFeaturedPost({
  slug,
  title,
  subtitle,
  dateLabel,
  date,
  readingLabel,
  tags = [],
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
        'group relative min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 md:p-6 lg:p-7',
        thumbnail
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10'
          : 'flex flex-col md:px-8 md:py-8 lg:px-10 lg:py-10',
      )}
    >
      {thumbnail ? (
        <BlogThumbnail
          thumbnail={thumbnail}
          priority
          className="rounded-xl border border-border/50"
        />
      ) : (
        <BlogGridTexture variant="card" />
      )}
      <div
        className={cn(
          'relative flex min-w-0 flex-col gap-4',
          thumbnail ? 'lg:justify-center' : 'max-w-4xl',
        )}
      >
        <Eyebrow as="p" wide>
          {labels.eyebrow}
        </Eyebrow>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <time dateTime={date}>{dateLabel}</time>
          <span aria-hidden="true">&middot;</span>
          <span>{readingLabel}</span>
        </p>
        <Heading
          as="h2"
          level="page"
          className={cn(
            'text-balance leading-tight group-hover:text-brand',
            thumbnail ? 'text-2xl lg:text-3xl xl:text-4xl' : 'text-3xl md:text-4xl lg:text-5xl',
          )}
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
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
        <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-brand">
          {labels.read}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </article>
  );
}
