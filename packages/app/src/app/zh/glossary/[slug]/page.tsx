import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/json-ld';
import { getPostBySlug } from '@/lib/blog/blog';
import {
  GLOSSARY_CATEGORY_LABELS_ZH,
  getAdjacentZhGlossaryEntries,
  getAllZhGlossaryEntries,
  getRelatedZhGlossaryEntries,
  getZhGlossaryEntry,
} from '@/lib/content/glossary-zh';
import { glossaryMetaTitle } from '@/lib/content/glossary-title';
import { ZH_LANG_TAG, zhAlternates } from '@/lib/i18n/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { clampMetaDescription } from '@/lib/seo/meta-text';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { analyticsPlacement } from '@/lib/analytics/placement';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllZhGlossaryEntries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getZhGlossaryEntry(slug);
  if (!entry) return {};

  const title = glossaryMetaTitle(entry, 'zh');
  const description = clampMetaDescription(entry.definition, 'zh');
  const url = `${SITE_URL}/zh/glossary/${entry.slug}`;
  const keywords = [
    entry.term,
    entry.abbreviation,
    ...(entry.aliases ?? []),
    'AI 推理术语表',
    'LLM 推理',
  ].filter((keyword): keyword is string => Boolean(keyword));

  return {
    title,
    description,
    keywords,
    authors: [{ name: AUTHOR_NAME }],
    alternates: zhAlternates(`/glossary/${entry.slug}`),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'zh',
      type: 'article',
    }),
  };
}

export default async function ZhGlossaryTermPage({ params }: Props) {
  const { slug } = await params;
  const entry = getZhGlossaryEntry(slug);
  if (!entry) notFound();

  const relatedTerms = getRelatedZhGlossaryEntries(entry);
  const adjacent = getAdjacentZhGlossaryEntries(entry.slug);
  const relatedArticles = entry.articleSlugs.flatMap((articleSlug) => {
    const post = getPostBySlug(articleSlug, 'zh');
    return post
      ? [{ slug: articleSlug, title: post.meta.title, subtitle: post.meta.subtitle }]
      : [];
  });
  const termUrl = `${SITE_URL}/zh/glossary/${entry.slug}`;
  const glossaryUrl = `${SITE_URL}/zh/glossary`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        '@id': termUrl,
        name: entry.term,
        ...(entry.abbreviation && { termCode: entry.abbreviation }),
        description: entry.definition,
        url: termUrl,
        inLanguage: ZH_LANG_TAG,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': glossaryUrl,
          name: 'InferenceX AI 推理术语表',
          url: glossaryUrl,
          inLanguage: ZH_LANG_TAG,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: '术语表',
            item: glossaryUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: entry.term,
            item: termUrl,
          },
        ],
      },
    ],
  };

  return (
    <main className="relative" {...analyticsPlacement('glossary')}>
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 pt-4 pb-8 lg:px-8 lg:pt-8">
        <article className="flex flex-col gap-10">
          <header className="border-b border-border/30 pb-8">
            <Link
              href="/zh/glossary"
              className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              AI 推理术语表
            </Link>
            <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>{GLOSSARY_CATEGORY_LABELS_ZH[entry.category]}</span>
              {entry.abbreviation && <span className="font-mono">{entry.abbreviation}</span>}
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold text-balance md:text-5xl">
              {entry.term}
            </h1>
            {entry.aliases && entry.aliases.length > 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                也称为 {entry.aliases.join('、')}
              </p>
            )}
          </header>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
            <div className="min-w-0 max-w-3xl">
              <section
                aria-labelledby="plain-language-heading"
                className="rounded-xl border border-border/30 bg-card p-5 md:p-6"
              >
                <p
                  id="plain-language-heading"
                  className="text-xs font-medium text-muted-foreground"
                >
                  先用大白话
                </p>
                <p className="mt-3 text-xl leading-relaxed font-medium text-pretty md:text-2xl">
                  {entry.plainEnglish}
                </p>
              </section>

              <section aria-labelledby="technical-definition-heading" className="mt-10">
                <h2 id="technical-definition-heading" className="text-xl font-semibold">
                  技术定义
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">{entry.definition}</p>
              </section>

              {entry.measurement && (
                <div className="mt-8 border-l-2 border-border pl-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {entry.measurement.label}
                  </p>
                  <p className="mt-1 font-mono text-sm leading-relaxed text-foreground">
                    {entry.measurement.value}
                  </p>
                </div>
              )}

              <div className="mt-10 space-y-10 border-t border-border/30 pt-10">
                <section aria-labelledby="engineering-details">
                  <h2 id="engineering-details" className="text-xl font-semibold">
                    工程细节
                  </h2>
                  <p className="mt-3 leading-7 text-muted-foreground">{entry.explanation}</p>
                </section>
                <section aria-labelledby="why-it-matters">
                  <h2 id="why-it-matters" className="text-xl font-semibold">
                    为什么重要
                  </h2>
                  <p className="mt-3 leading-7 text-muted-foreground">{entry.significance}</p>
                </section>
                <section aria-labelledby="reading-inferencex">
                  <h2 id="reading-inferencex" className="text-xl font-semibold">
                    如何在 InferenceX 中解读
                  </h2>
                  <p className="mt-3 leading-7 text-muted-foreground">{entry.benchmarkContext}</p>
                </section>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-medium text-muted-foreground">相关术语</p>
              <nav aria-label="相关术语" className="mt-3 flex flex-col">
                {relatedTerms.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/zh/glossary/${related.slug}`}
                    className="group flex items-center justify-between gap-3 border-b border-border/20 py-2.5 text-sm transition-colors last:border-b-0 hover:text-brand focus-visible:outline-none"
                  >
                    {related.term}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand"
                    />
                  </Link>
                ))}
              </nav>
            </aside>
          </div>

          {relatedArticles.length > 0 && (
            <section aria-labelledby="further-reading" className="border-t border-border/30 pt-10">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 id="further-reading" className="text-xl font-semibold">
                  在真实基准中理解这一概念
                </h2>
                <Link
                  href="/zh/blog"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  全部文章
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <div className="mt-4 divide-y divide-border/20">
                {relatedArticles.map((article) => (
                  <Link
                    key={article.slug}
                    href={`/zh/blog/${article.slug}`}
                    className="group grid gap-2 py-4 focus-visible:outline-none md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
                  >
                    <div>
                      <h3 className="font-medium leading-snug group-hover:text-brand">
                        {article.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {article.subtitle}
                      </p>
                    </div>
                    <ArrowRight
                      aria-hidden="true"
                      className="hidden size-4 text-muted-foreground transition-colors group-hover:text-foreground md:block"
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <nav aria-label="术语表翻页" className="grid gap-4 sm:grid-cols-2">
            {adjacent.previous ? (
              <Link
                href={`/zh/glossary/${adjacent.previous.slug}`}
                className="rounded-xl border border-border/30 p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none"
              >
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <ArrowLeft aria-hidden="true" className="size-3.5" />
                  上一条
                </span>
                <span className="mt-2 block font-medium">{adjacent.previous.term}</span>
              </Link>
            ) : (
              <div />
            )}
            {adjacent.next && (
              <Link
                href={`/zh/glossary/${adjacent.next.slug}`}
                className="rounded-xl border border-border/30 p-5 text-right transition-colors hover:bg-muted/40 focus-visible:outline-none"
              >
                <span className="flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground">
                  下一条
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </span>
                <span className="mt-2 block font-medium">{adjacent.next.term}</span>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </main>
  );
}
