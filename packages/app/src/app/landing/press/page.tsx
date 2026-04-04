import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const COVERAGE = [
  {
    outlet: 'The Information',
    date: 'March 2026',
    headline: 'SemiAnalysis Launches Open Benchmark Dashboard for GPU Inference',
    excerpt:
      'The new InferenceX platform provides unprecedented transparency into how GPUs actually perform under production inference workloads, challenging vendor-published specs.',
  },
  {
    outlet: 'Ars Technica',
    date: 'February 2026',
    headline: 'Finally, GPU Benchmarks That Match Reality',
    excerpt:
      'InferenceX tests GPUs under real concurrency and sustained load — not the single-request fairy tales that dominate vendor marketing materials.',
  },
  {
    outlet: 'SemiAnalysis',
    date: 'January 2026',
    headline: 'Why We Built InferenceX: The Case for Open Benchmarks',
    excerpt:
      'GPU purchasing decisions worth millions of dollars are made based on misleading benchmark data. We built InferenceX to fix that.',
  },
];

const BRAND_ASSETS = [
  {
    name: 'Logo Pack',
    format: 'SVG + PNG',
    description: 'Full logo, icon, and wordmark in light and dark variants.',
  },
  {
    name: 'Screenshot Kit',
    format: 'PNG 2x',
    description: 'Dashboard screenshots showing scatter plots, GPU graphs, and calculator views.',
  },
  {
    name: 'Brand Guidelines',
    format: 'PDF',
    description: 'Colors, typography, spacing, and usage rules for the InferenceX brand.',
  },
];

export const metadata: Metadata = {
  title: 'Press',
  description:
    'InferenceX press coverage, media mentions, and brand assets. Download logos, screenshots, and brand guidelines.',
  alternates: { canonical: `${SITE_URL}/landing/press` },
  openGraph: {
    title: 'Press | InferenceX',
    description: 'Press coverage and brand assets for InferenceX.',
    url: `${SITE_URL}/landing/press`,
  },
};

export default function PressPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Press
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              InferenceX in the news.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Selected coverage of InferenceX and the SemiAnalysis benchmark platform. For press
              inquiries, reach out to our communications team.
            </p>
          </header>

          <section className="grid gap-4 lg:grid-cols-3" aria-label="Press coverage">
            {COVERAGE.map((item) => (
              <article
                key={item.headline}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                    {item.outlet}
                  </p>
                  <span className="text-xs text-muted-foreground">{item.date}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
                  {item.headline}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.excerpt}</p>
              </article>
            ))}
          </section>

          <section aria-label="Brand assets">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Brand Assets
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {BRAND_ASSETS.map((asset) => (
                <div key={asset.name} className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
                      {asset.name}
                    </h3>
                    <span className="rounded-full border border-border/40 px-2 py-0.5 text-xs text-muted-foreground">
                      {asset.format}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {asset.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            For press inquiries, interviews, or custom benchmark data requests, contact
            press@semianalysis.com. We typically respond within 24 hours.
          </p>
        </Card>
      </div>
    </main>
  );
}
