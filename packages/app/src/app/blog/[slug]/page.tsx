import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

import { mdxComponents } from '@/components/blog/mdx-components';
import { getAllPosts, getPostBySlug } from '@/lib/blog';
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

  return {
    title: meta.title,
    description: meta.excerpt,
    keywords: meta.tags,
    authors: [{ name: meta.author }],
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.excerpt,
      url: `${SITE_URL}/blog/${slug}`,
      type: 'article',
      publishedTime: `${meta.date}T00:00:00Z`,
      ...(meta.modifiedDate && { modifiedTime: `${meta.modifiedDate}T00:00:00Z` }),
      authors: [meta.author],
      tags: meta.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.excerpt,
      creator: AUTHOR_HANDLE,
    },
  };
}

let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('shiki/themes/github-dark.mjs'), import('shiki/themes/github-light.mjs')],
      langs: [
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/jsx.mjs'),
        import('shiki/langs/sql.mjs'),
        import('shiki/langs/go.mjs'),
        import('shiki/langs/rust.mjs'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  }
  return highlighterPromise;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const result = getPostBySlug(slug);
  if (!result) notFound();

  const { meta, raw } = result;
  const highlighter = await getHighlighter();

  const { content } = await compileMDX({
    source: raw,
    components: mdxComponents,
    options: {
      mdxOptions: {
        rehypePlugins: [
          [
            rehypeShikiFromHighlighter,
            highlighter,
            {
              themes: { dark: 'github-dark', light: 'github-light' },
              defaultColor: false,
            },
          ],
        ],
      },
    },
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    author: { '@type': 'Person', name: meta.author },
    publisher: { '@type': 'Organization', name: AUTHOR_NAME },
    datePublished: `${meta.date}T00:00:00Z`,
    ...(meta.modifiedDate && { dateModified: `${meta.modifiedDate}T00:00:00Z` }),
    description: meta.excerpt,
    url: `${SITE_URL}/blog/${slug}`,
    wordCount: raw.trim().split(/\s+/).length,
    timeRequired: `PT${meta.readingTime}M`,
  };

  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>

      <Link
        href="/blog"
        className="text-sm text-muted-foreground hover:underline mb-8 inline-block"
      >
        &larr; Back to blog
      </Link>

      <header className="mb-10">
        <h1 className="text-4xl font-bold mb-4">{meta.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{meta.author}</span>
          <span>&middot;</span>
          <time dateTime={meta.date}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
          <span>&middot;</span>
          <span>{meta.readingTime} min read</span>
        </div>
        {meta.tags && meta.tags.length > 0 && (
          <div className="flex gap-2 mt-3">
            {meta.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <article className="prose prose-neutral dark:prose-invert max-w-none">{content}</article>
    </main>
  );
}
