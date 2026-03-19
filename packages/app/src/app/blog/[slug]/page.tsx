import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogPostContent } from '@/components/blog/blog-post-content';
import { BLOG_POSTS } from '@/components/blog/blog-data';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} | InferenceX Blog`,
      description: post.excerpt,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  return <BlogPostContent post={post} />;
}
