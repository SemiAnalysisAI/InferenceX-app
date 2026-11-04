import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const HERO_QUOTE = {
  text: "InferenceMAX's nightly results highlight the rapid pace of progress in the AMD software stack. It's exciting to witness the birth of an open project that provides a tied feedback loop between what the software team works on and how it affects specific ML use cases.",
  name: 'Quentin Colombet',
  title: 'Senior Director, AMD',
};

const FEATURES = [
  {
    label: 'Full Dashboard',
    title: 'Every Model, GPU & Metric',
    description:
      'Fully configurable inference benchmark charts with date ranges, concurrency sweeps, and raw data export. Compare NVIDIA B200, H200, H100, AMD MI355X, MI325X, MI300X and more.',
    href: '/inference',
  },
  {
    label: 'Quick Comparisons',
    title: 'Curated GPU Benchmarks',
    description:
      'Jump straight into the most popular GPU inference benchmark comparisons — GB200 vs B200, AMD generations, disaggregated serving, and more.',
    href: '/inference?preset=gb200-vs-b200',
  },
  {
    label: 'Supporters',
    title: '36+ Industry Quotes',
    description:
      'Endorsed by executives from OpenAI, NVIDIA, AMD, Microsoft, Meta, Hugging Face, and 30 more organizations building AI infrastructure.',
    href: '/quotes',
  },
  {
    label: 'Articles',
    title: 'Deep-Dive Analysis',
    description:
      'In-depth write-ups on GPU performance, benchmark methodology, and inference optimization from the SemiAnalysis research team.',
    href: '/blog',
  },
];

const BOTTOM_LINKS = [
  { label: 'GitHub — Benchmarks', href: 'https://github.com/SemiAnalysisAI/InferenceX' },
  { label: 'GitHub — Frontend', href: 'https://github.com/SemiAnalysisAI/InferenceX-app' },
  { label: 'Newsletter', href: 'https://newsletter.semianalysis.com' },
  { label: 'GPU Reliability', href: '/reliability' },
  { label: 'SemiAnalysis', href: 'https://semianalysis.com' },
];

export const metadata: Metadata = {
  title: 'Landing Variant G — Feature Cards + Quote Banner',
  description: 'InferenceX landing page variant with feature cards and quote banner.',
  alternates: { canonical: `${SITE_URL}/landing/changelog` },
};

export default function VariantG() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Open Source Benchmark
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              AI Inference Benchmark by SemiAnalysis
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX is the open-source AI inference benchmark that matches the rapid pace of
              modern AI development. Powered by one of the largest open-source GPU CI/CD fleets with
              NVIDIA GB200, AMD MI355X &amp; many more.
            </p>
          </header>

          {/* Quote banner */}
          <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
            <p className="text-sm leading-6 text-foreground italic">
              &ldquo;{HERO_QUOTE.text}&rdquo;
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              — {HERO_QUOTE.name}, {HERO_QUOTE.title}
            </p>
          </div>

          {/* Feature cards */}
          <section className="grid gap-4 md:grid-cols-2" aria-label="Features">
            {FEATURES.map((f) => (
              <Link
                key={f.label}
                href={f.href}
                className="group rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  {f.label}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground group-hover:text-brand transition-colors">
                  {f.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.description}</p>
                <div className="mt-4 flex items-center gap-1 text-sm text-brand">
                  Explore
                  <ArrowRight className="h-4 w-4 transition-all group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </section>

          {/* Bottom links */}
          <div className="flex flex-wrap gap-2">
            {BOTTOM_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-full border border-border/40 bg-background/20 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-brand/50 transition-all"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
