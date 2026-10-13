import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const STATS = [
  { value: '6+', label: 'GPU Architectures' },
  { value: '10+', label: 'Models Benchmarked' },
  { value: 'Daily', label: 'Update Frequency' },
  { value: '100%', label: 'Open Source' },
];

const PRESETS = [
  {
    title: 'GB200 NVL72 vs B200',
    description: 'Multi vs Single Node — Dynamo TRT on DeepSeek R1 at FP4.',
    href: '/inference?preset=gb200-vs-b200',
  },
  {
    title: 'B200 vs H200',
    description: 'Blackwell vs Hopper — throughput per GPU on DeepSeek R1 at FP8.',
    href: '/inference?preset=b200-vs-h200',
  },
  {
    title: 'AMD MI300X → MI325X → MI355X',
    description: 'Three generations of AMD Instinct on SGLang at FP8.',
    href: '/inference?preset=amd-generations',
  },
  {
    title: 'H100 vs GB300 Disagg',
    description: 'H100 FP8 vs GB300 FP8 vs GB300 FP4 disagg on DeepSeek R1.',
    href: '/inference?preset=h100-vs-gb300-disagg',
  },
  {
    title: 'Disagg B200 vs MI355X vs B200 TRT',
    description: 'Cross-vendor disaggregated serving comparison at FP8.',
    href: '/inference?preset=disagg-b200-vs-mi355x',
  },
  {
    title: 'MI355X SGLang Disagg Over Time',
    description: 'Tracks throughput improvements over time on DeepSeek R1 FP8.',
    href: '/inference?preset=mi355x-sglang-disagg-timeline',
  },
];

export const metadata: Metadata = {
  title: 'Landing Variant B — Stats + Full Presets',
  description: 'InferenceX landing page variant with stat counters and all 6 curated presets.',
  alternates: { canonical: `${SITE_URL}/landing/methodology` },
};

export default function VariantB() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          {/* Hero */}
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              By SemiAnalysis
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Open Source Continuous Inference Benchmark
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX is the open-source AI inference benchmark that matches the rapid pace of
              modern AI development. Powered by one of the largest open-source GPU CI/CD fleets with
              NVIDIA GB200, AMD MI355X &amp; many more.
            </p>
          </header>

          {/* Stats bar */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Key stats">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-brand/20 bg-brand/5 p-5 text-center"
              >
                <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
                  {s.value}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  {s.label}
                </p>
              </div>
            ))}
          </section>

          {/* All 6 presets */}
          <section aria-label="Quick comparisons">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Quick Comparisons
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PRESETS.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                      {p.title}
                    </h3>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{p.description}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/inference"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-brand/90 transition-colors"
            >
              Open Full Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/quotes"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              See what supporters say →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
