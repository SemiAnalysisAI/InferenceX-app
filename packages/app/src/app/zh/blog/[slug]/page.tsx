import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import remarkGfm from 'remark-gfm';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

import { BlogBackLink } from '@/components/blog/blog-back-link';
import { BlogPostNav } from '@/components/blog/blog-post-nav';
import { BlogToc } from '@/components/blog/blog-toc';
import { HashScroll } from '@/components/blog/hash-scroll';
import { createMdxComponents } from '@/components/blog/mdx-components';
import { ReadingProgressBar } from '@/components/blog/reading-progress-bar';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { Card } from '@/components/ui/card';
import { JsonLd } from '@/components/json-ld';
import { getAllPosts, getAdjacentPosts, extractHeadings, getPostBySlug } from '@/lib/blog';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
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

  return {
    title: meta.title,
    description: meta.subtitle,
    keywords: meta.tags,
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/blog/${slug}`),
    openGraph: {
      title: `${meta.title} | ${SITE_NAME}`,
      description: meta.subtitle,
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
      description: meta.subtitle,
      site: AUTHOR_HANDLE,
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

export default async function ZhBlogPostPage({ params }: Props) {
  const { slug } = await params;
  const result = getPostBySlug(slug, 'zh');
  if (!result) notFound();

  const { meta, raw } = result;
  const adjacent = getAdjacentPosts(slug, 'zh');
  const headings = extractHeadings(raw);
  const highlighter = await getHighlighter();

  const { content } = await compileMDX({
    source: raw,
    components: createMdxComponents('zh'),
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
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
    author: { '@type': 'Person', name: AUTHOR_NAME },
    publisher: { '@type': 'Organization', name: AUTHOR_NAME },
    datePublished: `${meta.date}T00:00:00Z`,
    ...(meta.modifiedDate && { dateModified: `${meta.modifiedDate}T00:00:00Z` }),
    description: meta.subtitle,
    url: `${SITE_URL}/zh/blog/${slug}`,
    inLanguage: ZH_LANG_TAG,
    wordCount: raw.trim().split(/\s+/u).length,
    timeRequired: `PT${meta.readingTime}M`,
  };

  return (
    <main className="relative">
      <HashScroll />
      <ReadingProgressBar slug={slug} />
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section data-blog-section="true" className="flex flex-col gap-4">
          <Card>
            <BlogBackLink href="/zh/blog" label="返回文章列表" />
            <header>
              <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">{meta.title}</h2>
              <p className="mt-3 text-base lg:text-lg text-muted-foreground">{meta.subtitle}</p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-3">
                <span>{AUTHOR_NAME}</span>
                <span>&middot;</span>
                <time dateTime={meta.date}>
                  {new Date(`${meta.date}T00:00:00Z`).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </time>
                <span>&middot;</span>
                <span>{meta.readingTime} 分钟阅读</span>
                <span>&middot;</span>
                <Link href={`/blog/${slug}`} hrefLang="en" className="hover:underline text-brand">
                  阅读英文原文
                </Link>
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
              <div className="flex items-center gap-1.5 mt-4">
                <ShareTwitterButton text={meta.title} />
                <ShareLinkedInButton />
              </div>
            </header>
            {headings.length > 0 && (
              <div className="mt-4">
                <BlogToc headings={headings} label="本页目录" />
              </div>
            )}
            <div className="mt-6 pt-6 border-t border-border/40">
              <article
                data-blog-article
                className="prose prose-neutral dark:prose-invert max-w-none blog-prose"
              >
                {content}
                <p className="text-xs text-muted-foreground">
                  本文由英文原文翻译而来，如有歧义以英文版为准。所有文章版权归 &copy; SemiAnalysis
                  所有，保留所有权利。覆盖应用源代码的 AGPL-3.0 许可证不适用于文章内容。
                </p>
              </article>
            </div>
          </Card>
          <BlogPostNav
            prev={adjacent.prev ? { slug: adjacent.prev.slug, title: adjacent.prev.title } : null}
            next={adjacent.next ? { slug: adjacent.next.slug, title: adjacent.next.title } : null}
            basePath="/zh/blog"
            labels={{ prev: '上一篇', next: '下一篇' }}
          />
        </section>
      </div>
    </main>
  );
}
