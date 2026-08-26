import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { GUIDE_CATEGORIES, getAllGuides, getGuidesByCategory } from '@/lib/guides';
import { enAlternates } from '@/lib/i18n';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const title = 'LLM Inference Guides';
const description =
  'Practical, benchmark-grounded guides to LLM inference: choosing GPUs and serving engines, sizing memory and fleets, understanding cost per token, and benchmarking correctly.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'LLM inference guide',
    'best GPU for LLM inference',
    'LLM serving engine comparison',
    'LLM inference cost',
    'GPU capacity planning',
    'inference benchmarking guide',
    'AI infrastructure guides',
    'LLM deployment guide',
  ],
  alternates: enAlternates('/guides'),
  openGraph: {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/guides`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function GuidesPage() {
  const guides = getAllGuides();
  const groups = getGuidesByCategory();
  const guidesUrl = `${SITE_URL}/guides`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': guidesUrl,
    name: `InferenceX ${title}`,
    description,
    url: guidesUrl,
    creator: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
    },
    hasPart: guides.map((guide) => ({
      '@type': 'TechArticle',
      '@id': `${guidesUrl}/${guide.slug}`,
      headline: guide.title,
      description: guide.description,
      url: `${guidesUrl}/${guide.slug}`,
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
                  Guides / AI infrastructure decisions
                </p>
                <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-[-0.045em] text-balance md:text-6xl lg:text-7xl">
                  Decisions, grounded in measurements.
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
                  Which GPU, which engine, how much memory, what it costs. Each guide answers one
                  deployment question using the same measured data that drives the InferenceX
                  dashboard, and links to the live benchmarks behind every claim.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50 lg:grid-cols-1">
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    Guides
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{guides.length}</dd>
                </div>
                <div className="bg-background/70 p-4">
                  <dt className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                    Topics
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {GUIDE_CATEGORIES.length}
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          <div className="border-t border-border/50 px-5 py-8 md:px-8 md:py-10 lg:px-12">
            {groups.map((group) => (
              <section
                key={group.category}
                aria-label={group.category}
                className="py-6 first:pt-0 last:pb-0"
              >
                <h2 className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
                  {group.category}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {group.guides.map((guide) => (
                    <Link
                      key={guide.slug}
                      href={`/guides/${guide.slug}`}
                      className="group rounded-xl border border-border/40 bg-background/20 p-5 transition-colors hover:border-brand/40 hover:bg-brand/5"
                    >
                      <h3 className="font-semibold leading-snug group-hover:text-brand">
                        {guide.title}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {guide.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Why guides, not folklore
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Inference advice goes stale in weeks.
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Engine releases have moved measured throughput 1.8x in a single version, and new
              recipes reshuffle price-performance rankings monthly. These guides teach the decision
              frameworks that stay true, and defer every perishable number to the live benchmark
              pages.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/inference" className="text-brand hover:underline">
                Live benchmark data →
              </Link>
              <Link href="/compare-per-dollar" className="text-brand hover:underline">
                Performance per dollar →
              </Link>
            </div>
          </Card>

          <Card>
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Go deeper
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Definitions, chips, and methodology.
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Every guide cross-links the glossary for precise definitions, the chip pages for
              hardware specs and rental rates, and the technical articles where each claim was
              measured and published.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
              <Link href="/glossary" className="text-brand hover:underline">
                AI inference glossary →
              </Link>
              <Link href="/chips" className="text-brand hover:underline">
                GPU chip pages →
              </Link>
              <Link href="/blog" className="text-brand hover:underline">
                Technical articles →
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
