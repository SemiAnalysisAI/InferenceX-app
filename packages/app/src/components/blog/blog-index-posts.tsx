'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Heading } from '@/components/ui/heading';
import type { Locale } from '@/lib/i18n/i18n';

import { BLOG_COPY, blogIndexPath } from './blog-copy';
import { BlogFeaturedPost } from './blog-featured-post';
import { BlogPostCard, type BlogPostCardProps } from './blog-post-card';
import { BlogTagFilter } from './blog-tag-filter';
import { BlogTagLink } from './blog-tag-link';

export type BlogIndexCard = Pick<
  BlogPostCardProps,
  | 'slug'
  | 'title'
  | 'subtitle'
  | 'dateLabel'
  | 'date'
  | 'readingLabel'
  | 'tags'
  | 'thumbnail'
  | 'basePath'
>;

interface BlogIndexPostsProps {
  locale: Locale;
  cards: BlogIndexCard[];
  allTags: string[];
  topTags: string[];
  moreTags: string[];
}

export function BlogIndexPosts({
  locale,
  cards,
  allTags,
  topTags,
  moreTags,
  activeTag: rawTag,
}: BlogIndexPostsProps & { activeTag?: string }) {
  const t = BLOG_COPY[locale];
  const basePath = blogIndexPath(locale);
  const activeTag = rawTag
    ? (allTags.find((tag) => tag.toLowerCase() === rawTag.trim().toLowerCase()) ?? rawTag.trim())
    : undefined;
  const filtered = activeTag ? cards.filter((card) => card.tags?.includes(activeTag)) : cards;
  const [featured, ...rest] = filtered;
  const showFeatured = !activeTag && featured !== undefined;
  const grid = showFeatured ? rest : filtered;

  return (
    <>
      {showFeatured && (
        <BlogFeaturedPost
          {...featured}
          labels={{ eyebrow: t.featured, read: t.readArticle, tags: t.tags }}
        />
      )}

      <section className="flex flex-col gap-6" aria-labelledby="blog-list-heading">
        <div className="flex flex-col gap-4 border-t border-border/40 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <Heading as="h2" level="section" id="blog-list-heading" className="scroll-mt-24">
              {activeTag ? t.taggedHeading(activeTag) : t.allPosts}
            </Heading>
            <p className="text-sm text-muted-foreground tabular-nums" data-testid="blog-post-count">
              {t.count(filtered.length)}
            </p>
          </div>
          {topTags.length > 0 && (
            <BlogTagFilter
              primary={topTags}
              more={moreTags}
              activeTag={activeTag}
              basePath={basePath}
              labels={{ all: t.allTag, more: t.moreTags, filter: t.filterLabel }}
            />
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border/60 p-8">
            <p className="text-muted-foreground">
              {activeTag ? t.emptyTag(activeTag) : t.emptyAll}
            </p>
            {activeTag && (
              <BlogTagLink tag="" clear basePath={basePath}>
                {t.clearFilter}
              </BlogTagLink>
            )}
          </div>
        ) : (
          <div
            className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3"
            data-testid="blog-post-grid"
          >
            {grid.map((card, index) => (
              <BlogPostCard key={card.slug} {...card} tagsLabel={t.tags} priority={index < 3} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function UrlTagReader({ onTag }: { onTag: (tag: string | undefined) => void }) {
  const tag = useSearchParams()?.get('tag') ?? undefined;
  useEffect(() => onTag(tag), [onTag, tag]);
  return null;
}

/**
 * The blog index is prerendered unfiltered. Reading `?tag=` in its own Suspense leaf keeps the
 * post list hydrated from the static HTML; only the leaf is client-rendered.
 */
export function BlogIndexPostsWithUrlTag(props: BlogIndexPostsProps) {
  const [tag, setTag] = useState<string | undefined>();
  return (
    <>
      <Suspense fallback={null}>
        <UrlTagReader onTag={setTag} />
      </Suspense>
      <BlogIndexPosts {...props} activeTag={tag} />
    </>
  );
}
