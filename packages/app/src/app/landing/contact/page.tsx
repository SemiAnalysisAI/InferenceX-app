import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const QUOTES = [
  {
    text: 'Open collaboration is driving the next era of AI innovation. The open-source InferenceMAX benchmark gives the community transparent, nightly results that inspire trust and accelerate progress.',
    name: 'Dr. Lisa Su',
    title: 'Chair and CEO, AMD',
  },
  {
    text: "As we build systems at unprecedented scale, it's critical for the ML community to have open, transparent benchmarks that reflect how inference really performs.",
    name: 'Peter Hoeschele',
    title: 'VP Infrastructure, OpenAI Stargate',
  },
];

const SECTIONS = [
  {
    label: 'Benchmark',
    title: 'Full Dashboard',
    description:
      'Every model, GPU, framework, and metric. Fully configurable charts with date ranges, concurrency sweeps, and raw data export.',
    href: '/inference',
    cta: 'Open Dashboard',
  },
  {
    label: 'Compare',
    title: 'Quick Comparisons',
    description:
      'Jump straight into the most popular GPU inference benchmark comparisons, curated and ready to explore.',
    href: '/inference?preset=gb200-vs-b200',
    cta: 'GB200 vs B200',
  },
  {
    label: 'Community',
    title: 'Supporters',
    description:
      'Endorsed by 36+ industry leaders including OpenAI, NVIDIA, AMD, Microsoft, Meta, Hugging Face, and more.',
    href: '/quotes',
    cta: 'See Supporters',
  },
  {
    label: 'Insights',
    title: 'Articles & Analysis',
    description:
      'In-depth write-ups on GPU performance, benchmark methodology, and inference optimization.',
    href: '/blog',
    cta: 'Read Articles',
  },
  {
    label: 'Reliability',
    title: 'GPU Reliability Data',
    description: 'Production reliability metrics for GPU hardware across our benchmark clusters.',
    href: '/reliability',
    cta: 'View Data',
  },
  {
    label: 'Open Source',
    title: 'Contribute on GitHub',
    description:
      'The benchmark runner, dashboard, and all configs are open source under Apache 2.0. Fork, fix, extend.',
    href: 'https://github.com/SemiAnalysisAI/InferenceX',
    cta: 'Star on GitHub',
  },
];

export const metadata: Metadata = {
  title: 'Landing Variant I — Section Directory',
  description: 'InferenceX landing page variant with a full section directory and inline quotes.',
  alternates: { canonical: `${SITE_URL}/landing/contact` },
};

export default function VariantI() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              InferenceX by SemiAnalysis
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              The open-source AI inference benchmark.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Compare AI inference performance across GPUs and frameworks. Real benchmarks on NVIDIA
              GB200, B200, AMD MI355X, and more. Free, open-source, continuously updated.
            </p>
          </header>

          {/* Inline quotes */}
          <section className="grid gap-4 md:grid-cols-2" aria-label="Quotes">
            {QUOTES.map((q) => (
              <div key={q.name} className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
                <Quote className="h-4 w-4 text-brand mb-2" />
                <p className="text-sm leading-6 text-foreground italic">&ldquo;{q.text}&rdquo;</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  — {q.name}, {q.title}
                </p>
              </div>
            ))}
          </section>

          {/* Section directory */}
          <section
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            aria-label="Explore InferenceX"
          >
            {SECTIONS.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="group rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  {s.label}
                </p>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground group-hover:text-brand transition-colors">
                  {s.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.description}</p>
                <div className="mt-4 flex items-center gap-1 text-sm text-brand">
                  {s.cta}
                  <ArrowRight className="h-4 w-4 transition-all group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Continuous open-source inference benchmarking by{' '}
            <Link href="https://semianalysis.com" className="text-brand hover:underline">
              SemiAnalysis
            </Link>
            . Subscribe to the{' '}
            <Link href="https://newsletter.semianalysis.com" className="text-brand hover:underline">
              newsletter
            </Link>{' '}
            for weekly updates.
          </p>
        </Card>
      </div>
    </main>
  );
}
