import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import 'katex/dist/katex.min.css';

import { BlogPostContent } from '@/components/blog/blog-post-content';
import { JsonLd } from '@/components/json-ld';
import {
  blogDescription,
  getAllPosts,
  getAdjacentPosts,
  getRelatedPosts,
  buildBlogBreadcrumbJsonLdZh,
  buildBlogPostingJsonLd,
  extractHeadings,
  getPostBySlug,
} from '@/lib/blog';
import { compileBlogMdx } from '@/lib/blog-mdx';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllPosts('zh').map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = getPostBySlug(slug, 'zh');
  if (!result) return {};
  const { meta } = result;
  const description = blogDescription(meta);

  return {
    // Short " | InferenceX" suffix via `absolute` (mirrors the English page)
    // so the headline keeps more of the SERP title before truncation.
    title: { absolute: `${meta.title} | ${SITE_NAME}` },
    description,
    keywords: meta.tags,
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/blog/${slug}`),
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/zh/blog/${slug}`,
      type: 'article',
      locale: ZH_OG_LOCALE,
      publishedTime: `${meta.date}T00:00:00Z`,
      ...(meta.modifiedDate && { modifiedTime: `${meta.modifiedDate}T00:00:00Z` }),
      authors: [AUTHOR_NAME],
      tags: meta.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    },
  };
}

export default async function ZhBlogPostPage({ params }: Props) {
  const { slug } = await params;
  const result = getPostBySlug(slug, 'zh');
  if (!result) notFound();

  const { meta, raw } = result;
  const adjacent = getAdjacentPosts(slug, 'zh');
  const related = getRelatedPosts(slug, getAllPosts('zh'));
  const headings = extractHeadings(raw);
  const { content } = await compileBlogMdx(raw, 'zh');

  const jsonLd = buildBlogPostingJsonLd(meta, raw, 'zh');
  const breadcrumbJsonLd = buildBlogBreadcrumbJsonLdZh(slug, meta.title);

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <BlogPostContent
        locale="zh"
        meta={meta}
        headings={headings}
        content={content}
        adjacent={adjacent}
        related={related}
      />
    </>
  );
}
