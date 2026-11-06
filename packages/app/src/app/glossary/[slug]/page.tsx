import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/json-ld';
import { Heading } from '@/components/ui/heading';
import { PagerCard } from '@/components/ui/pager-card';
import {
  ARTICLE_H2_CLASS,
  READING_PAGE_CLASS,
  READING_SECTION_CLASS,
  READING_TEXT_CLASS,
  READING_TOP_CLASS,
} from '@/components/ui/reading-layout';
import { getPostBySlug } from '@/lib/blog/blog';
import {
  getAdjacentGlossaryEntries,
  getAllGlossaryEntries,
  getGlossaryEntry,
  getRelatedGlossaryEntries,
} from '@/lib/content/glossary';
import { glossaryMetaTitle } from '@/lib/content/glossary-title';
import { enAlternates } from '@/lib/i18n/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { clampMetaDescription } from '@/lib/seo/meta-text';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { analyticsPlacement } from '@/lib/analytics/placement';
import { cn } from '@/lib/shared/utils';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllGlossaryEntries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = getGlossaryEntry(slug);
  if (!entry) return {};

  const title = glossaryMetaTitle(entry, 'en');
  const description = clampMetaDescription(entry.definition, 'en');
  const url = `${SITE_URL}/glossary/${entry.slug}`;
  const keywords = [
    entry.term,
    entry.abbreviation,
    ...(entry.aliases ?? []),
    'AI inference glossary',
    'LLM inference',
  ].filter((keyword): keyword is string => Boolean(keyword));

  return {
    title,
    description,
    keywords,
    authors: [{ name: AUTHOR_NAME }],
    alternates: enAlternates(`/glossary/${entry.slug}`),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'en',
      type: 'article',
    }),
  };
}

export default async function GlossaryTermPage({ params }: Props) {
  const { slug } = await params;
  const entry = getGlossaryEntry(slug);
  if (!entry) notFound();

  const relatedTerms = getRelatedGlossaryEntries(entry);
  const adjacent = getAdjacentGlossaryEntries(entry.slug);
  const relatedArticles = entry.articleSlugs.flatMap((articleSlug) => {
    const post = getPostBySlug(articleSlug);
    return post
      ? [{ slug: articleSlug, title: post.meta.title, subtitle: post.meta.subtitle }]
      : [];
  });
  const termUrl = `${SITE_URL}/glossary/${entry.slug}`;
  const glossaryUrl = `${SITE_URL}/glossary`;
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
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': glossaryUrl,
          name: 'InferenceX AI Inference Glossary',
          url: glossaryUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Glossary',
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
      <div className={cn(READING_PAGE_CLASS, READING_TOP_CLASS)}>
        <article className="flex flex-col gap-10">
          <header className="border-b border-border/30 pb-8">
            <Link
              href="/glossary"
              className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              AI inference glossary
            </Link>
            <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>{entry.category}</span>
              {entry.abbreviation && <span className="font-mono">{entry.abbreviation}</span>}
            </p>
            <Heading as="h1" level="reading" className="mt-3 max-w-4xl">
              {entry.term}
            </Heading>
            {entry.aliases && entry.aliases.length > 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Also known as {entry.aliases.join(', ')}
              </p>
            )}
          </header>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
            <div className="min-w-0 max-w-measure">
              <section
                aria-labelledby="plain-english-heading"
                className="rounded-xl border border-border/30 bg-card p-5 md:p-6"
              >
                <p id="plain-english-heading" className="text-xs font-medium text-muted-foreground">
                  In plain English
                </p>
                <p className="mt-3 text-xl leading-relaxed font-medium text-pretty md:text-2xl">
                  {entry.plainEnglish}
                </p>
              </section>

              <section aria-labelledby="technical-definition-heading" className="mt-12">
                <h2 id="technical-definition-heading" className={ARTICLE_H2_CLASS}>
                  Technical definition
                </h2>
                <p className={cn(READING_TEXT_CLASS, 'mt-4')}>{entry.definition}</p>
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

              <div className={cn(READING_SECTION_CLASS, 'mt-12 space-y-12')}>
                <section aria-labelledby="engineering-details">
                  <h2 id="engineering-details" className={ARTICLE_H2_CLASS}>
                    Engineering details
                  </h2>
                  <p className={cn(READING_TEXT_CLASS, 'mt-4')}>{entry.explanation}</p>
                </section>
                <section aria-labelledby="why-it-matters">
                  <h2 id="why-it-matters" className={ARTICLE_H2_CLASS}>
                    Why it matters
                  </h2>
                  <p className={cn(READING_TEXT_CLASS, 'mt-4')}>{entry.significance}</p>
                </section>
                <section aria-labelledby="reading-inferencex">
                  <h2 id="reading-inferencex" className={ARTICLE_H2_CLASS}>
                    How to read it in InferenceX
                  </h2>
                  <p className={cn(READING_TEXT_CLASS, 'mt-4')}>{entry.benchmarkContext}</p>
                </section>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-medium text-muted-foreground">Related terms</p>
              <nav aria-label="Related glossary terms" className="mt-3 flex flex-col">
                {relatedTerms.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/glossary/${related.slug}`}
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
            <section aria-labelledby="further-reading" className={READING_SECTION_CLASS}>
              <div className="flex max-w-measure flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 id="further-reading" className={ARTICLE_H2_CLASS}>
                  See the concept in real benchmarks
                </h2>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  All articles
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <div className="mt-4 max-w-measure divide-y divide-border/20">
                {relatedArticles.map((article) => (
                  <Link
                    key={article.slug}
                    href={`/blog/${article.slug}`}
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

          <nav aria-label="Glossary pagination" className="grid gap-4 sm:grid-cols-2">
            {adjacent.previous ? (
              <PagerCard
                href={`/glossary/${adjacent.previous.slug}`}
                direction="prev"
                label="Previous"
                title={adjacent.previous.term}
              />
            ) : (
              <div aria-hidden="true" className="hidden sm:block" />
            )}
            {adjacent.next && (
              <PagerCard
                href={`/glossary/${adjacent.next.slug}`}
                direction="next"
                label="Next"
                title={adjacent.next.term}
              />
            )}
          </nav>
        </article>
      </div>
    </main>
  );
}
