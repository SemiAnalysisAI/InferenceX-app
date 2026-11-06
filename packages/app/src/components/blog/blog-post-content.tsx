import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import {
  READING_DEK_CLASS,
  READING_PAGE_CLASS,
  READING_TOP_CLASS,
} from '@/components/ui/reading-layout';
import {
  type AdjacentPosts,
  getPostThumbnail,
  type BlogPostMeta,
  formatBlogDate,
  type TocHeading,
} from '@/lib/blog/blog';
import { blogTagLabel } from '@/lib/blog/blog-tag-label';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import { analyticsPlacement } from '@/lib/analytics/placement';
import { cn } from '@/lib/shared/utils';
import { AUTHOR_NAME } from '@semianalysisai/inferencex-constants';

import { BlogBackLink } from './blog-back-link';
import { BLOG_COPY, blogIndexPath } from './blog-copy';
import { BlogPostCard } from './blog-post-card';
import { BlogPostNav } from './blog-post-nav';
import { BLOG_PROSE_CLASS } from './blog-prose';
import { BlogShareRow } from './blog-share-row';
import { BlogSidebarCta } from './blog-sidebar-cta';
import { BlogToc } from './blog-toc';
import { HashScroll } from './hash-scroll';
import { ReadingProgressBar } from './reading-progress-bar';

const CTA_PATH = '/agentx';

export interface BlogPostContentProps {
  locale: Locale;
  meta: BlogPostMeta;
  headings: TocHeading[];
  content: ReactNode;
  adjacent: AdjacentPosts;
  related: BlogPostMeta[];
}

export function BlogPostContent({
  locale,
  meta,
  headings,
  content,
  adjacent,
  related,
}: BlogPostContentProps) {
  const t = BLOG_COPY[locale];
  const basePath = blogIndexPath(locale);
  const { slug } = meta;
  const tags = meta.tags ?? [];
  const shareLabels = {
    share: t.share,
    copyLink: t.copyLink,
    copied: t.copied,
  };
  const ctaLabels = {
    eyebrow: t.ctaEyebrow,
    title: t.ctaTitle,
    body: t.ctaBody,
    button: t.ctaButton,
  };

  return (
    <main className="relative" data-testid="blog-post-page">
      <HashScroll />
      <ReadingProgressBar slug={slug} />
      <div className={cn(READING_PAGE_CLASS, READING_TOP_CLASS, 'flex flex-col gap-10 lg:gap-12')}>
        <section data-blog-section="true" className="flex flex-col gap-10 lg:gap-12">
          <header
            className="flex flex-col gap-5 border-b border-border/30 pb-8 lg:pb-10"
            data-testid="blog-post-hero"
          >
            <BlogBackLink href={basePath} label={t.backToIndex} />
            <div className="flex max-w-measure flex-col gap-4">
              {tags[0] && <Eyebrow as="p">{blogTagLabel(tags[0], locale)}</Eyebrow>}
              <Heading as="h1" level="reading">
                {meta.title}
              </Heading>
              <p className={READING_DEK_CLASS}>{meta.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <span>{AUTHOR_NAME}</span>
              <span aria-hidden="true">&middot;</span>
              <time dateTime={meta.date}>{formatBlogDate(meta.date, locale)}</time>
              <span aria-hidden="true">&middot;</span>
              <span>{t.readingTime(meta.readingTime)}</span>
              {meta.modifiedDate && meta.modifiedDate !== meta.date && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span>{t.updated(formatBlogDate(meta.modifiedDate, locale))}</span>
                </>
              )}
              {locale === 'zh' && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <Link href={`/blog/${slug}`} hrefLang="en" className="text-brand hover:underline">
                    {t.readOriginal}
                  </Link>
                </>
              )}
            </div>
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t.tags}>
                {tags.map((tag) => (
                  <li key={tag}>
                    <Badge asChild variant="secondary">
                      <Link href={`${basePath}?tag=${encodeURIComponent(tag)}`}>
                        {blogTagLabel(tag, locale)}
                      </Link>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <BlogShareRow
              title={meta.title}
              slug={slug}
              labels={shareLabels}
              className="lg:hidden"
            />
          </header>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,var(--container-measure))_17rem] lg:justify-between lg:gap-16 xl:grid-cols-[minmax(0,var(--container-measure))_18rem] xl:gap-20">
            <div className="flex min-w-0 flex-col gap-8">
              {headings.length > 0 && (
                <BlogToc
                  headings={headings}
                  locale={locale}
                  variant="inline"
                  className="lg:hidden"
                />
              )}
              <article
                data-blog-article
                {...analyticsPlacement('blog_article')}
                className={BLOG_PROSE_CLASS}
              >
                {content}
                <p className="mt-12 border-t border-border/30 pt-6 text-xs leading-5 text-muted-foreground">
                  {t.copyright}
                </p>
              </article>
            </div>

            <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-6 lg:self-start">
              {headings.length > 0 && (
                <BlogToc headings={headings} locale={locale} variant="sidebar" />
              )}
              <BlogShareRow title={meta.title} slug={slug} labels={shareLabels} />
              <BlogSidebarCta href={localePath(CTA_PATH, locale)} slug={slug} labels={ctaLabels} />
            </aside>
          </div>
        </section>

        <BlogPostNav
          prev={adjacent.prev ? { slug: adjacent.prev.slug, title: adjacent.prev.title } : null}
          next={adjacent.next ? { slug: adjacent.next.slug, title: adjacent.next.title } : null}
          basePath={basePath}
          labels={{ prev: t.prev, next: t.next }}
        />

        {related.length > 0 && (
          <section
            className="flex flex-col gap-6 border-t border-border/30 pt-10"
            aria-labelledby="blog-related-heading"
            data-testid="blog-related"
          >
            <Heading as="h2" level="section" id="blog-related-heading">
              {t.moreArticles}
            </Heading>
            <div className="grid gap-6 md:grid-cols-3">
              {related.map((post) => (
                <BlogPostCard
                  key={post.slug}
                  slug={post.slug}
                  title={post.title}
                  subtitle={post.subtitle}
                  date={post.date}
                  dateLabel={formatBlogDate(post.date, locale)}
                  readingLabel={t.readingTime(post.readingTime)}
                  tags={post.tags}
                  locale={locale}
                  tagsLabel={t.tags}
                  thumbnail={getPostThumbnail(post.slug)}
                  basePath={basePath}
                  placement="related"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
