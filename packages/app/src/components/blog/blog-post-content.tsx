import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import {
  type AdjacentPosts,
  getPostThumbnail,
  type BlogPostMeta,
  formatBlogDate,
  type TocHeading,
} from '@/lib/blog/blog';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import { analyticsPlacement } from '@/lib/analytics/placement';
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
  const shareLabels = { share: t.share, copyLink: t.copyLink, copied: t.copied };
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
      <div className="container mx-auto flex flex-col gap-10 px-4 pb-16 lg:gap-12 lg:px-8">
        <section data-blog-section="true" className="flex flex-col gap-10 lg:gap-12">
          <header
            className="flex flex-col gap-5 border-b border-border/40 pb-8 pt-4 lg:pb-10 lg:pt-8"
            data-testid="blog-post-hero"
          >
            <BlogBackLink href={basePath} label={t.backToIndex} />
            <div className="flex max-w-4xl flex-col gap-4">
              {tags[0] && (
                <Eyebrow as="p" wide>
                  {tags[0]}
                </Eyebrow>
              )}
              <Heading
                as="h1"
                level="display"
                className="text-3xl leading-tight md:text-4xl lg:text-5xl lg:leading-[1.08]"
              >
                {meta.title}
              </Heading>
              <p className="max-w-prose text-lg leading-7 text-muted-foreground">{meta.subtitle}</p>
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
                    <Badge asChild variant="outline">
                      <Link href={`${basePath}?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
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

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-20">
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
                <p className="mt-12 max-w-[72ch] border-t border-border/40 pt-6 text-xs leading-5 text-muted-foreground">
                  {t.copyright}
                </p>
              </article>
            </div>

            <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-6 lg:self-start">
              {headings.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px]">
                  <BlogToc headings={headings} locale={locale} variant="sidebar" />
                </div>
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
            className="flex flex-col gap-6 border-t border-border/40 pt-10"
            aria-labelledby="blog-related-heading"
            data-testid="blog-related"
          >
            <Heading as="h2" level="section" id="blog-related-heading">
              {t.moreArticles}
            </Heading>
            <div className="grid items-start gap-6 md:grid-cols-3">
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
