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
  buildBlogBreadcrumbJsonLd,
  buildBlogPostingJsonLd,
  extractHeadings,
  getPostBySlug,
  hasZhTranslation,
} from '@/lib/blog';
import { compileBlogMdx } from '@/lib/blog-mdx';
import { languageAlternates } from '@/lib/i18n';
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
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = getPostBySlug(slug);
  if (!result) return {};
  const { meta } = result;
  const description = blogDescription(meta);

  return {
    // `absolute` keeps a short " | InferenceX" suffix instead of the long
    // "%s | InferenceX by SemiAnalysis" root template, leaving more room for
    // the headline before Google truncates the SERP title.
    title: { absolute: `${meta.title} | ${SITE_NAME}` },
    description,
    keywords: meta.tags,
    authors: [{ name: AUTHOR_NAME }],
    alternates: {
      canonical: `${SITE_URL}/blog/${slug}`,
      // hreflang to the Chinese translation when one exists under content/blog/zh/.
      ...(hasZhTranslation(slug) && { languages: languageAlternates(`/blog/${slug}`) }),
    },
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/blog/${slug}`,
      type: 'article',
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

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const result = getPostBySlug(slug);
  if (!result) notFound();

  const { meta, raw } = result;
  const adjacent = getAdjacentPosts(slug);
  const related = getRelatedPosts(slug, getAllPosts());
  const headings = extractHeadings(raw);
  const { content } = await compileBlogMdx(raw);

  const jsonLd = buildBlogPostingJsonLd(meta, raw);
  const breadcrumbJsonLd = buildBlogBreadcrumbJsonLd(slug, meta.title);

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <BlogPostContent
        locale="en"
        meta={meta}
        headings={headings}
        content={content}
        adjacent={adjacent}
        related={related}
      />
    </>
  );
}
