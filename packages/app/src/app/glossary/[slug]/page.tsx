import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getPostBySlug } from '@/lib/blog';
import {
  getAdjacentGlossaryEntries,
  getAllGlossaryEntries,
  getGlossaryEntry,
  getRelatedGlossaryEntries,
} from '@/lib/glossary';
import { enAlternates } from '@/lib/i18n';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

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

  const title = `${entry.term}: AI Inference Definition`;
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
    description: entry.definition,
    keywords,
    authors: [{ name: AUTHOR_NAME }],
    alternates: enAlternates(`/glossary/${entry.slug}`),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: entry.definition,
      url,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: entry.definition,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    },
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
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <article className="mx-auto max-w-5xl">
          <Card className="overflow-hidden p-0">
            <header className="relative border-b border-border/50 px-5 py-8 md:px-10 md:py-12">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand/70 to-transparent"
              />
              <Link
                href="/glossary"
                className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand"
              >
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:-translate-x-0.5"
                >
                  ←
                </span>
                AI inference glossary
              </Link>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand/25 bg-brand/8 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-brand uppercase">
                  {entry.category}
                </span>
                {entry.abbreviation && (
                  <span className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
                    {entry.abbreviation}
                  </span>
                )}
              </div>
              <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.035em] text-balance md:text-6xl">
                {entry.term}
              </h1>
              {entry.aliases && entry.aliases.length > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Also known as {entry.aliases.join(', ')}
                </p>
              )}
            </header>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="px-5 py-8 md:px-10 md:py-12">
                <section
                  aria-labelledby="plain-english-heading"
                  className="rounded-xl border border-brand/20 bg-brand/6 p-5 md:p-6"
                >
                  <p
                    id="plain-english-heading"
                    className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase"
                  >
                    In plain English
                  </p>
                  <p className="mt-3 text-xl leading-relaxed font-medium text-pretty md:text-2xl">
                    {entry.plainEnglish}
                  </p>
                </section>

                <section aria-labelledby="technical-definition-heading" className="mt-8">
                  <h2
                    id="technical-definition-heading"
                    className="text-xl font-semibold tracking-tight"
                  >
                    Technical definition
                  </h2>
                  <p className="mt-3 leading-7 text-muted-foreground">{entry.definition}</p>
                </section>

                {entry.measurement && (
                  <div className="mt-8 border-l-2 border-brand bg-brand/6 px-5 py-4">
                    <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      {entry.measurement.label}
                    </p>
                    <p className="mt-1 font-mono text-sm leading-relaxed text-foreground">
                      {entry.measurement.value}
                    </p>
                  </div>
                )}

                <div className="mt-10 space-y-10 border-t border-border/50 pt-10">
                  <section aria-labelledby="engineering-details">
                    <h2 id="engineering-details" className="text-xl font-semibold tracking-tight">
                      Engineering details
                    </h2>
                    <p className="mt-3 leading-7 text-muted-foreground">{entry.explanation}</p>
                  </section>
                  <section aria-labelledby="why-it-matters">
                    <h2 id="why-it-matters" className="text-xl font-semibold tracking-tight">
                      Why it matters
                    </h2>
                    <p className="mt-3 leading-7 text-muted-foreground">{entry.significance}</p>
                  </section>
                  <section aria-labelledby="reading-inferencex">
                    <h2 id="reading-inferencex" className="text-xl font-semibold tracking-tight">
                      How to read it in InferenceX
                    </h2>
                    <p className="mt-3 leading-7 text-muted-foreground">{entry.benchmarkContext}</p>
                  </section>
                </div>
              </div>

              <aside className="border-t border-border/50 bg-muted/10 px-5 py-8 lg:border-t-0 lg:border-l lg:px-6 lg:py-12">
                <p className="font-mono text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Related terms
                </p>
                <nav aria-label="Related glossary terms" className="mt-4 flex flex-col">
                  {relatedTerms.map((related) => (
                    <Link
                      key={related.slug}
                      href={`/glossary/${related.slug}`}
                      className="group border-b border-border/40 py-3 text-sm font-medium transition-colors last:border-b-0 hover:text-brand"
                    >
                      <span className="flex items-center justify-between gap-3">
                        {related.term}
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                        >
                          →
                        </span>
                      </span>
                    </Link>
                  ))}
                </nav>
              </aside>
            </div>
          </Card>

          {relatedArticles.length > 0 && (
            <section aria-labelledby="further-reading" className="mt-4">
              <Card>
                <div className="flex flex-col gap-2 border-b border-border/50 pb-5 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
                      Source material
                    </p>
                    <h2 id="further-reading" className="mt-2 text-2xl font-semibold tracking-tight">
                      See the concept in real benchmarks
                    </h2>
                  </div>
                  <Link href="/blog" className="text-sm text-muted-foreground hover:text-brand">
                    All articles →
                  </Link>
                </div>
                <div className="divide-y divide-border/40">
                  {relatedArticles.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/blog/${article.slug}`}
                      className="group grid gap-2 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6"
                    >
                      <div>
                        <h3 className="font-semibold leading-snug group-hover:text-brand group-hover:underline">
                          {article.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {article.subtitle}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="hidden text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand md:block"
                      >
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </Card>
            </section>
          )}

          <nav aria-label="Glossary pagination" className="mt-4 grid gap-4 sm:grid-cols-2">
            {adjacent.previous ? (
              <Link
                href={`/glossary/${adjacent.previous.slug}`}
                className="rounded-xl border border-border/40 bg-background/20 p-5 backdrop-blur-[2px] transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  ← Previous
                </span>
                <span className="mt-2 block font-semibold">{adjacent.previous.term}</span>
              </Link>
            ) : (
              <div />
            )}
            {adjacent.next && (
              <Link
                href={`/glossary/${adjacent.next.slug}`}
                className="rounded-xl border border-border/40 bg-background/20 p-5 text-right backdrop-blur-[2px] transition-colors hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  Next →
                </span>
                <span className="mt-2 block font-semibold">{adjacent.next.term}</span>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </main>
  );
}
