import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogPostContent } from '@/components/blog/blog-post-content';
import { BLOG_POSTS, getReadingTime } from '@/components/blog/blog-data';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  AUTHOR_URL,
  OG_IMAGE,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return {};

  const ogImage = post.coverImage ?? `${SITE_URL}/blog/${post.slug}/opengraph-image`;

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    authors: [{ name: post.author }],
    alternates: {
      canonical: `${SITE_URL}/blog/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | ${SITE_NAME} Blog`,
      description: post.excerpt,
      url: `${SITE_URL}/blog/${post.slug}`,
      siteName: SITE_NAME,
      type: 'article',
      publishedTime: `${post.date}T00:00:00Z`,
      ...(post.modifiedDate && { modifiedTime: `${post.modifiedDate}T00:00:00Z` }),
      authors: post.author.split(', '),
      tags: post.tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [ogImage],
      creator: AUTHOR_HANDLE,
      site: AUTHOR_HANDLE,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  const readingTime = getReadingTime(post.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SITE_NAME,
            item: SITE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Blog',
            item: `${SITE_URL}/blog`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: post.title,
            item: `${SITE_URL}/blog/${post.slug}`,
          },
        ],
      },
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        url: `${SITE_URL}/blog/${post.slug}`,
        datePublished: `${post.date}T00:00:00Z`,
        ...(post.modifiedDate && { dateModified: `${post.modifiedDate}T00:00:00Z` }),
        wordCount: post.content.trim().split(/\s+/).length,
        timeRequired: `PT${readingTime}M`,
        author: post.author.split(', ').map((name) => ({
          '@type': 'Person',
          name,
        })),
        publisher: {
          '@type': 'Organization',
          name: AUTHOR_NAME,
          url: AUTHOR_URL,
          logo: { '@type': 'ImageObject', url: OG_IMAGE },
        },
        image: post.coverImage ?? `${SITE_URL}/blog/${post.slug}/opengraph-image`,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${SITE_URL}/blog/${post.slug}`,
        },
        ...(post.tags && {
          keywords: post.tags.join(', '),
          articleSection: post.tags[0],
        }),
        isPartOf: {
          '@type': 'Blog',
          '@id': `${SITE_URL}/blog`,
          name: `${SITE_NAME} Blog`,
        },
        inLanguage: 'en-US',
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <BlogPostContent post={post} readingTime={readingTime} />
    </>
  );
}
