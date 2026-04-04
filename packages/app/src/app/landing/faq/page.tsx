import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const HERO_STATS = [
  { value: 'NVIDIA GB200', sub: 'B200 · H200 · H100' },
  { value: 'AMD MI355X', sub: 'MI325X · MI300X' },
];

const GPUS = [
  'NVIDIA GB200 NVL72',
  'NVIDIA GB300',
  'NVIDIA B200',
  'NVIDIA H200',
  'NVIDIA H100',
  'AMD MI355X',
  'AMD MI325X',
  'AMD MI300X',
];

const PRESETS = [
  {
    title: 'GB200 NVL72 vs B200',
    href: '/inference?preset=gb200-vs-b200',
    description: 'Multi vs Single Node at FP4.',
  },
  {
    title: 'B200 vs H200',
    href: '/inference?preset=b200-vs-h200',
    description: 'Blackwell vs Hopper at FP8.',
  },
  {
    title: 'AMD MI300X → MI355X',
    href: '/inference?preset=amd-generations',
    description: 'Three AMD generations.',
  },
  {
    title: 'H100 vs GB300 Disagg',
    href: '/inference?preset=h100-vs-gb300-disagg',
    description: 'Cross-generation disagg.',
  },
  {
    title: 'Disagg B200 vs MI355X',
    href: '/inference?preset=disagg-b200-vs-mi355x',
    description: 'Cross-vendor disagg.',
  },
  {
    title: 'MI355X Over Time',
    href: '/inference?preset=mi355x-sglang-disagg-timeline',
    description: 'Throughput timeline.',
  },
];

const QUOTE = {
  text: 'Inference demand is growing exponentially, driven by long-context reasoning. NVIDIA Grace Blackwell NVL72 was invented for this new era of thinking AI. By benchmarking frequently, InferenceMAX gives the industry a transparent view of LLM inference performance on real-world workloads.',
  name: 'Jensen Huang',
  title: 'Founder & CEO, NVIDIA',
};

export const metadata: Metadata = {
  title: 'Landing Variant J — GPU Focus + Dense Layout',
  description:
    'InferenceX landing page variant with GPU-centric layout, dense presets, and hardware chips.',
  alternates: { canonical: `${SITE_URL}/landing/faq` },
};

export default function VariantJ() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              InferenceX
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl max-w-4xl">
              Real-world GPU inference benchmarks. Updated daily.
            </h1>
            <div className="mt-6 grid gap-4 md:grid-cols-2 max-w-lg">
              {HERO_STATS.map((s) => (
                <div key={s.value} className="rounded-2xl border border-brand/20 bg-brand/5 p-4">
                  <p className="text-lg font-semibold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.sub}</p>
                </div>
              ))}
            </div>
          </header>

          {/* GPU chips */}
          <section aria-label="Supported GPUs">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Hardware We Benchmark
            </h2>
            <div className="flex flex-wrap gap-2">
              {GPUS.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-border/40 bg-background/20 px-4 py-2 text-sm font-medium text-foreground"
                >
                  {g}
                </span>
              ))}
            </div>
          </section>

          {/* Dense presets grid */}
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-3" aria-label="Quick comparisons">
            {PRESETS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group rounded-2xl border border-border/40 bg-background/20 p-4 transition-all hover:border-brand/50"
              >
                <div className="flex items-start justify-between gap-1">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors leading-tight">
                    {p.title}
                  </h3>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
              </Link>
            ))}
          </section>

          {/* Quote */}
          <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
            <Quote className="h-4 w-4 text-brand mb-2" />
            <p className="text-sm leading-6 text-foreground italic max-w-3xl">
              &ldquo;{QUOTE.text}&rdquo;
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              — {QUOTE.name}, {QUOTE.title}
            </p>
          </div>

          {/* Bottom nav */}
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/inference"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-brand/90 transition-colors"
            >
              Full Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/quotes"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Supporters →
            </Link>
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Articles →
            </Link>
            <Link
              href="/reliability"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Reliability →
            </Link>
            <Link
              href="https://github.com/SemiAnalysisAI/InferenceX"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub →
            </Link>
            <Link
              href="https://newsletter.semianalysis.com"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Newsletter →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
