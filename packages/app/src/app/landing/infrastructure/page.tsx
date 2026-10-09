import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const QUOTES = [
  {
    text: "As we build systems at unprecedented scale, it's critical for the ML community to have open, transparent benchmarks that reflect how inference really performs across hardware and software.",
    name: 'Peter Hoeschele',
    title: 'VP of Infrastructure, OpenAI Stargate',
    org: 'OpenAI',
  },
  {
    text: 'Inference demand is growing exponentially, driven by long-context reasoning. NVIDIA Grace Blackwell NVL72 was invented for this new era of thinking AI.',
    name: 'Jensen Huang',
    title: 'Founder & CEO, NVIDIA',
    org: 'NVIDIA',
  },
  {
    text: 'Open collaboration is driving the next era of AI innovation. The open-source InferenceMAX benchmark gives the community transparent, nightly results.',
    name: 'Dr. Lisa Su',
    title: 'Chair and CEO, AMD',
    org: 'AMD',
  },
];

const GPUS = [
  'NVIDIA GB200 NVL72',
  'NVIDIA B200',
  'NVIDIA H200',
  'NVIDIA H100',
  'AMD MI355X',
  'AMD MI325X',
  'AMD MI300X',
];

export const metadata: Metadata = {
  title: 'Landing Variant C — Quotes + GPU List',
  description: 'InferenceX landing page variant featuring executive quotes and GPU hardware list.',
  alternates: { canonical: `${SITE_URL}/landing/infrastructure` },
};

export default function VariantC() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          {/* Hero */}
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Trusted by Industry Leaders
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Trusted by GigaWatt Token Factories
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Compare AI inference performance across GPUs and frameworks. Real benchmarks on NVIDIA
              GB200, B200, AMD MI355X, and more. Free, open-source, continuously updated.
            </p>
          </header>

          {/* Executive quotes */}
          <section className="grid gap-4 lg:grid-cols-3" aria-label="Supporter quotes">
            {QUOTES.map((q) => (
              <article
                key={q.name}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  {q.org}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground italic">
                  &ldquo;{q.text}&rdquo;
                </p>
                <div className="mt-4 border-t border-border/30 pt-3">
                  <p className="text-sm font-semibold text-foreground">{q.name}</p>
                  <p className="text-xs text-muted-foreground">{q.title}</p>
                </div>
              </article>
            ))}
          </section>

          {/* GPU hardware list */}
          <section aria-label="Supported hardware">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Hardware We Benchmark
            </h2>
            <div className="flex flex-wrap gap-2">
              {GPUS.map((gpu) => (
                <span
                  key={gpu}
                  className="rounded-full border border-border/40 bg-background/20 px-4 py-2 text-sm font-medium text-foreground"
                >
                  {gpu}
                </span>
              ))}
            </div>
          </section>

          {/* CTAs */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/inference"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-brand/90 transition-colors"
            >
              Open Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/quotes"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See all 36 supporters →
            </Link>
            <Link
              href="https://github.com/SemiAnalysisAI/InferenceX"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Star on GitHub →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
