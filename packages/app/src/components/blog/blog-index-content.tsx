import Link from 'next/link';

import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import {
  getPostThumbnail,
  type BlogPostMeta,
  formatBlogDate,
  getAllPosts,
  getTopTags,
} from '@/lib/blog';
import { type Locale, localePath } from '@/lib/i18n';

import { BLOG_COPY, blogIndexPath } from './blog-copy';
import { BlogFeaturedPost } from './blog-featured-post';
import { BlogPostCard } from './blog-post-card';
import { BlogTagFilter } from './blog-tag-filter';
import { BlogTagLink } from './blog-tag-link';

const INLINE_TAG_COUNT = 8;

interface BlogIndexContentProps {
  locale: Locale;
  activeTag?: string;
}

function cardProps(post: BlogPostMeta, locale: Locale) {
  const t = BLOG_COPY[locale];
  return {
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle,
    date: post.date,
    dateLabel: formatBlogDate(post.date, locale),
    readingLabel: t.readingTime(post.readingTime),
    tags: post.tags,
    thumbnail: getPostThumbnail(post.slug),
    basePath: blogIndexPath(locale),
  };
}

export function BlogIndexContent({ locale, activeTag: rawTag }: BlogIndexContentProps) {
  const t = BLOG_COPY[locale];
  const basePath = blogIndexPath(locale);
  const posts = getAllPosts(locale);
  // Tags are stored lowercase; accept any casing in the query and show the canonical form.
  const allTags = [...new Set(posts.flatMap((p) => p.tags ?? []))];
  const activeTag = rawTag
    ? (allTags.find((tag) => tag.toLowerCase() === rawTag.trim().toLowerCase()) ?? rawTag.trim())
    : undefined;
  const topTags = getTopTags(posts, INLINE_TAG_COUNT);
  const topSet = new Set(topTags);
  const moreTags = allTags.filter((tag) => !topSet.has(tag)).toSorted();
  const filtered = activeTag ? posts.filter((p) => p.tags?.includes(activeTag)) : posts;
  const [featured, ...rest] = filtered;
  const showFeatured = !activeTag && featured !== undefined;
  const grid = showFeatured ? rest : filtered;

  return (
    <div
      className="container mx-auto flex flex-col gap-8 px-4 pb-16 lg:gap-10 lg:px-8"
      data-testid="blog-index-page"
    >
      <header className="flex flex-col gap-3 pt-4 lg:pt-8">
        <Eyebrow as="p" wide>
          {t.indexEyebrow}
        </Eyebrow>
        <Heading as="h1" level="page" className="text-balance">
          {t.indexTitle}
        </Heading>
        <p className="max-w-prose text-base text-muted-foreground lg:text-lg">{t.indexIntro}</p>
        <p className="text-sm text-muted-foreground">
          {t.glossaryLead}{' '}
          <Link
            href={localePath('/glossary', locale)}
            className="font-medium text-brand hover:underline"
          >
            {t.glossaryLink}
          </Link>
          {locale === 'zh' ? '。' : '.'}
        </p>
      </header>

      {showFeatured && (
        <BlogFeaturedPost
          {...cardProps(featured, locale)}
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
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="blog-post-grid">
            {grid.map((post, index) => (
              <BlogPostCard
                key={post.slug}
                {...cardProps(post, locale)}
                tagsLabel={t.tags}
                priority={index < 3}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
