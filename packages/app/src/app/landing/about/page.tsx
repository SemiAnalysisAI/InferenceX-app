import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const PRESETS = [
  {
    title: 'GB200 NVL72 vs B200 — Multi vs Single Node',
    description: 'GB200 NVL72 Dynamo TRT vs B200 Dynamo TRT on DeepSeek R1 (8k/1k) at FP4.',
    href: '/inference?preset=gb200-vs-b200',
    tags: ['DeepSeek', 'GB200', 'B200', 'FP4'],
  },
  {
    title: 'B200 vs H200 — Blackwell vs Hopper',
    description:
      'Blackwell B200 vs Hopper H200 Dynamo TRT throughput per GPU on DeepSeek R1 at FP8.',
    href: '/inference?preset=b200-vs-h200',
    tags: ['DeepSeek', 'B200', 'H200', 'FP8'],
  },
  {
    title: 'AMD MI300X → MI325X → MI355X',
    description: 'Three generations of AMD Instinct on SGLang at FP8.',
    href: '/inference?preset=amd-generations',
    tags: ['DeepSeek', 'MI300X', 'MI355X', 'SGLang'],
  },
];

const LINKS = [
  { label: 'Dashboard', href: '/inference' },
  { label: 'Supporters', href: '/quotes' },
  { label: 'Articles', href: '/blog' },
  { label: 'GPU Reliability', href: '/reliability' },
  { label: 'GitHub', href: 'https://github.com/SemiAnalysisAI/InferenceX' },
  { label: 'Newsletter', href: 'https://newsletter.semianalysis.com' },
];

export const metadata: Metadata = {
  title: 'Landing Variant A — Hero + Grid',
  description: 'InferenceX landing page variant with hero header and preset grid layout.',
  alternates: { canonical: `${SITE_URL}/landing/about` },
};

export default function VariantA() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          {/* Hero */}
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Open Source Benchmark
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              The open standard for ML inference benchmarking.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Compare AI inference performance across GPUs and frameworks. Real benchmarks on NVIDIA
              GB200, B200, AMD MI355X, and more. Free, open-source, continuously updated by
              SemiAnalysis.
            </p>
            <div className="mt-6">
              <Link
                href="/inference"
                className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-brand/90 transition-colors"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          {/* Quick Comparisons */}
          <section className="grid gap-4 lg:grid-cols-3" aria-label="Quick comparisons">
            {PRESETS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-[-0.04em] text-foreground group-hover:text-brand transition-colors">
                    {p.title}
                  </h2>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{p.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </section>

          {/* Navigation Links */}
          <section
            className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
            aria-label="Site links"
          >
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-center text-sm font-medium text-foreground hover:bg-brand/10 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Continuous open-source inference benchmarking. Real-world, reproducible, auditable
            performance data trusted by trillion dollar AI infrastructure operators like OpenAI,
            Oracle, Microsoft, etc.
          </p>
        </Card>
      </div>
    </main>
  );
}
