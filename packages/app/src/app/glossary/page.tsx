import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { GlossaryBrowser, type GlossaryBrowserEntry } from '@/components/glossary/glossary-browser';
import { JsonLd } from '@/components/seo/json-ld';
import { Card } from '@/components/ui/card';
import { READING_PAGE_CLASS } from '@/components/ui/reading-layout';
import { Stat } from '@/components/ui/stat';
import { getAllPosts } from '@/lib/blog/blog';
import { GLOSSARY_CATEGORIES, getAllGlossaryEntries } from '@/lib/content/glossary';
import { enAlternates } from '@/lib/i18n/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { analyticsPlacement } from '@/lib/analytics/placement';
import { cn } from '@/lib/shared/utils';

const MORE_LINK = 'inline-flex items-center gap-1 text-brand hover:underline';

const title = 'AI Inference Glossary';
const description =
  'Clear definitions of agentic inference, LLM benchmark, serving metric, parallelism, precision, chip hardware and inference software terms.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'AI inference glossary',
    'agentic inference glossary',
    'AgentX benchmark terms',
    'LLM inference terms',
    'GPU benchmark terminology',
    'inference serving glossary',
    'LLM performance metrics',
    'distributed inference',
  ],
  alternates: enAlternates('/glossary'),
  ...socialMetadata({
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/glossary`,
    locale: 'en',
  }),
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
    <main className="relative" {...analyticsPlacement('glossary')}>
      <JsonLd data={jsonLd} />
      <div className={cn(READING_PAGE_CLASS, 'flex flex-col gap-10 pt-4 lg:pt-8')}>
        <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-semibold text-balance md:text-4xl">
              AI inference glossary
            </h1>
            <p className="mt-4 max-w-measure text-base leading-reading text-muted-foreground md:text-lg md:leading-8">
              Definitions for agentic inference, benchmark metrics, serving techniques, numerical
              formats, and distributed systems concepts used across InferenceX. Entries describe
              measured behavior and published benchmark recipes.
            </p>
          </div>
          <dl className="flex gap-10">
            <Stat size="lg" label="Terms" value={entries.length} />
            <Stat size="lg" label="Categories" value={GLOSSARY_CATEGORIES.length} />
            <Stat size="lg" label="Articles reviewed" value={articleCount} />
          </dl>
        </header>

        <Card className="overflow-hidden p-0 md:p-0">
          <GlossaryBrowser entries={browserEntries} categories={GLOSSARY_CATEGORIES} />
        </Card>

        <section className="grid gap-10 border-t border-border/30 pt-10 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold">The full curve tells the story</h2>
            <p className="mt-3 max-w-measure leading-reading text-foreground">
              LLM serving balances per-user speed against aggregate throughput. InferenceX uses full
              Pareto curves and matched-interactivity comparisons to show that tradeoff across
              operating points. One maximum-throughput point cannot rank the complete system.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
              <Link href="/glossary/interactivity" className={MORE_LINK}>
                Interactivity
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/glossary/pareto-frontier" className={MORE_LINK}>
                Pareto frontier
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/glossary/iso-interactivity" className={MORE_LINK}>
                Iso-interactivity
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Definitions connected to real recipes</h2>
            <p className="mt-3 max-w-measure leading-reading text-foreground">
              Every term page links to InferenceX articles where the concept changes a measured
              result, including MTP acceptance behavior, NVL72 wide-EP scaling, and software-only
              speedups on unchanged chips.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
              <Link href="/agentx/methodology" className={MORE_LINK}>
                AgentX methodology
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/blog" className={MORE_LINK}>
                Browse technical articles
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/inference" className={MORE_LINK}>
                Explore live benchmark data
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
