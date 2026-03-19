import type { Metadata } from 'next';

import { BlogContent } from '@/components/blog/blog-content';
import { BLOG_POSTS } from '@/components/blog/blog-data';
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  OG_IMAGE,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

const BLOG_DESCRIPTION =
  'Deep dives into inference benchmarking, GPU performance, and the economics of AI compute from the InferenceX team at SemiAnalysis.';

export const metadata: Metadata = {
  title: 'Blog',
  description: BLOG_DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
  openGraph: {
    title: `Blog | ${SITE_NAME} by ${AUTHOR_NAME}`,
    description: BLOG_DESCRIPTION,
    url: `${SITE_URL}/blog`,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
};

export default function BlogPage() {
  const sorted = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));

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
        ],
      },
      {
        '@type': 'Blog',
        '@id': `${SITE_URL}/blog`,
        name: `${SITE_NAME} Blog`,
        description: BLOG_DESCRIPTION,
        url: `${SITE_URL}/blog`,
        publisher: {
          '@type': 'Organization',
          name: AUTHOR_NAME,
          url: AUTHOR_URL,
          logo: { '@type': 'ImageObject', url: OG_IMAGE },
        },
        inLanguage: 'en-US',
        blogPost: sorted.map((post) => ({
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          url: `${SITE_URL}/blog/${post.slug}`,
          datePublished: `${post.date}T00:00:00Z`,
          ...(post.modifiedDate && { dateModified: `${post.modifiedDate}T00:00:00Z` }),
          author: post.author.split(', ').map((name) => ({
            '@type': 'Person',
            name,
          })),
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <BlogContent />
    </>
  );
}
