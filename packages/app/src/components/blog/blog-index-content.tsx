import Link from 'next/link';

import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import {
  getPostThumbnail,
  type BlogPostMeta,
  formatBlogDate,
  getAllPosts,
  getTopTags,
} from '@/lib/blog/blog';
import { type Locale, localePath } from '@/lib/i18n/i18n';

import { BLOG_COPY, blogIndexPath } from './blog-copy';
import { type BlogIndexCard, BlogIndexPostsWithUrlTag } from './blog-index-posts';

const INLINE_TAG_COUNT = 8;

function cardProps(post: BlogPostMeta, locale: Locale): BlogIndexCard {
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

export function blogIndexData(locale: Locale) {
  const posts = getAllPosts(locale);
  const allTags = [...new Set(posts.flatMap((p) => p.tags ?? []))];
  const topTags = getTopTags(posts, INLINE_TAG_COUNT);
  const topSet = new Set(topTags);
  return {
    cards: posts.map((post) => cardProps(post, locale)),
    allTags,
    topTags,
    moreTags: allTags.filter((tag) => !topSet.has(tag)).toSorted(),
  };
}

export function BlogIndexContent({ locale }: { locale: Locale }) {
  const t = BLOG_COPY[locale];

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

      <BlogIndexPostsWithUrlTag locale={locale} {...blogIndexData(locale)} />
    </div>
  );
}
