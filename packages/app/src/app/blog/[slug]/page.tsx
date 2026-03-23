import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

import { mdxComponents } from '@/components/blog/mdx-components';
import { Card } from '@/components/ui/card';
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
    description: meta.subtitle,
    keywords: meta.tags,
    authors: [{ name: 'SemiAnalysis' }],
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.subtitle,
      url: `${SITE_URL}/blog/${slug}`,
      type: 'article',
      publishedTime: `${meta.date}T00:00:00Z`,
      ...(meta.modifiedDate && { modifiedTime: `${meta.modifiedDate}T00:00:00Z` }),
      authors: ['SemiAnalysis'],
      tags: meta.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.subtitle,
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
    author: { '@type': 'Person', name: 'SemiAnalysis' },
    publisher: { '@type': 'Organization', name: AUTHOR_NAME },
    datePublished: `${meta.date}T00:00:00Z`,
    ...(meta.modifiedDate && { dateModified: `${meta.modifiedDate}T00:00:00Z` }),
    description: meta.subtitle,
    url: `${SITE_URL}/blog/${slug}`,
    wordCount: raw.trim().split(/\s+/).length,
    timeRequired: `PT${meta.readingTime}M`,
  };

  return (
    <main className="relative">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-16 lg:gap-4">
        <section>
          <Card>
            <nav>
              <Link
                href="/blog"
                className="text-sm text-muted-foreground hover:underline mb-4 inline-block"
              >
                &larr;&nbsp;&nbsp;Back to blog
              </Link>
            </nav>
            <header>
              <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">{meta.title}</h1>
              <p className="mt-3 text-base lg:text-lg text-muted-foreground">{meta.subtitle}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-3">
                <span>{'SemiAnalysis'}</span>
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
                {meta.tags && meta.tags.length > 0 && (
                  <>
                    <span>&middot;</span>
                    {meta.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-3 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </header>
          </Card>
          <Card>
            <article className="prose prose-neutral dark:prose-invert max-w-none mx-4 md:mx-8">
              {content}
            </article>
          </Card>
        </section>
      </div>
    </main>
  );
}
