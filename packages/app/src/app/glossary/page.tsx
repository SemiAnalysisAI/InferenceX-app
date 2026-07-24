import type { Metadata } from 'next';
import Link from 'next/link';

import { GlossaryBrowser, type GlossaryBrowserEntry } from '@/components/glossary/glossary-browser';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getAllPosts } from '@/lib/blog';
import { GLOSSARY_CATEGORIES, getAllGlossaryEntries } from '@/lib/glossary';
import { enAlternates } from '@/lib/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const title = 'AI Inference Glossary';
const description =
  'Clear, technically grounded definitions for LLM inference benchmarks, serving metrics, distributed parallelism, numerical precision, GPU hardware, and inference software.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'AI inference glossary',
    'LLM inference terms',
    'GPU benchmark terminology',
    'inference serving glossary',
    'LLM performance metrics',
    'distributed inference',
  ],
  alternates: enAlternates('/glossary'),
  openGraph: {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/glossary`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function GlossaryPage() {
  const entries = getAllGlossaryEntries().toSorted((a, b) => a.term.localeCompare(b.term));
  const articleCount = getAllPosts().length;
  const browserEntries: GlossaryBrowserEntry[] = entries.map((entry) => ({
    slug: entry.slug,
    term: entry.term,
    ...(entry.abbreviation && { abbreviation: entry.abbreviation }),
    category: entry.category,
    plainEnglish: entry.plainEnglish,
    searchText: [
      entry.term,
      entry.abbreviation,
      ...(entry.aliases ?? []),
      entry.category,
      entry.plainEnglish,
      entry.definition,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase(),
  }));
  const glossaryUrl = `${SITE_URL}/glossary`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': glossaryUrl,
    name: 'InferenceX AI Inference Glossary',
    description,
    url: glossaryUrl,
    creator: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
    },
    hasDefinedTerm: entries.map((entry) => ({
      '@type': 'DefinedTerm',
      '@id': `${glossaryUrl}/${entry.slug}`,
      name: entry.term,
      ...(entry.abbreviation && { termCode: entry.abbreviation }),
      description: entry.definition,
      url: `${glossaryUrl}/${entry.slug}`,
    })),
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <Card className="overflow-hidden p-0">
          <header className="relative px-5 py-10 md:px-8 md:py-14 lg:px-12 lg:py-16">
            <div
              aria-hidden="true"
              className="absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-linear-to-r from-transparent via-brand/75 to-transparent"
            />
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.2em] text-brand uppercase">
                  Field guide / AI infrastructure
                </p>
                <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.045em] text-balance md:text-6xl lg:text-7xl">
                  The language behind the inference curve.
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
                  Definitions for the metrics, serving techniques, numerical formats, and
                  distributed systems concepts used across InferenceX. Based on measured behavior,
                  not vendor peak specifications.
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50 lg:grid-cols-1">
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    Terms
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{entries.length}</dd>
                </div>
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    Categories
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {GLOSSARY_CATEGORIES.length}
                  </dd>
                </div>
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    Articles reviewed
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{articleCount}</dd>
                </div>
              </dl>
            </div>
          </header>

          <GlossaryBrowser entries={browserEntries} categories={GLOSSARY_CATEGORIES} />
        </Card>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Reading the benchmark
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              The full curve tells the story.
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              LLM serving balances per-user speed against aggregate throughput. InferenceX uses full
              Pareto curves and matched-interactivity comparisons to show that tradeoff across
              operating points. One maximum-throughput point cannot rank the complete system.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/glossary/interactivity" className="text-brand hover:underline">
                Interactivity →
              </Link>
              <Link href="/glossary/pareto-frontier" className="text-brand hover:underline">
                Pareto frontier →
              </Link>
              <Link href="/glossary/iso-interactivity" className="text-brand hover:underline">
                Iso-interactivity →
              </Link>
            </div>
          </Card>

          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Grounded in measurements
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Definitions connected to real recipes.
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Every term page links to InferenceX articles where the concept changes a measured
              result, including MTP acceptance behavior, NVL72 wide-EP scaling, and software-only
              speedups on unchanged GPUs.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/blog" className="text-brand hover:underline">
                Browse technical articles →
              </Link>
              <Link href="/inference" className="text-brand hover:underline">
                Explore live benchmark data →
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
