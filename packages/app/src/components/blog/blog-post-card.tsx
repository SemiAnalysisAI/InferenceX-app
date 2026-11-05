'use client';

import Link from 'next/link';

import { BlogThumbnail } from '@/components/blog/blog-thumbnail';
import { Badge } from '@/components/ui/badge';
import { Heading } from '@/components/ui/heading';
import { track } from '@/lib/analytics/analytics';
import type { PostThumbnail } from '@/lib/blog/blog';
import { cn } from '@/lib/shared/utils';

export interface BlogPostCardProps {
  slug: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  date: string;
  readingLabel: string;
  tags?: string[];
  tagsLabel?: string;
  thumbnail: PostThumbnail | null;
  basePath?: string;
  placement?: 'index' | 'related';
  priority?: boolean;
  className?: string;
}

const MAX_TAGS = 3;

export function BlogPostCard({
  slug,
  title,
  subtitle,
  dateLabel,
  date,
  readingLabel,
  tags = [],
  tagsLabel = 'Tags',
  thumbnail,
  basePath = '/blog',
  placement = 'index',
  priority = false,
  className,
}: BlogPostCardProps) {
  const shown = tags.slice(0, MAX_TAGS);
  const hidden = tags.length - shown.length;
  return (
    <article
      data-testid="blog-post-card"
      className={cn(
        'group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-[2px] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5',
        className,
      )}
    >
      <BlogThumbnail
        thumbnail={thumbnail}
        tag={tags[0]}
        readingLabel={readingLabel}
        priority={priority}
        className="border-b border-border/40"
      />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <time dateTime={date}>{dateLabel}</time>
          <span aria-hidden="true">&middot;</span>
          <span>{readingLabel}</span>
        </p>
        <Heading
          as="h3"
          level="card"
          className="line-clamp-3 text-balance text-lg leading-snug group-hover:text-brand"
        >
          <Link
            href={`${basePath}/${slug}`}
            className="focus-visible:outline-none before:absolute before:inset-0 before:z-10 before:content-['']"
            onClick={() => track('blog_post_clicked', { slug, title, placement })}
          >
            {title}
          </Link>
        </Heading>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
        {shown.length > 0 && (
          <ul className="mt-auto flex flex-wrap gap-1.5 pt-1" aria-label={tagsLabel}>
            {shown.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
            {hidden > 0 && (
              <li>
                <Badge variant="outline" className="tabular-nums">
                  +{hidden}
                </Badge>
              </li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}
