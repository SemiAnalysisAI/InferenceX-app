import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const PRESETS = [
  {
    title: 'GB200 NVL72 vs B200 — Multi vs Single Node',
    description: 'GB200 NVL72 Dynamo TRT vs B200 Dynamo TRT on DeepSeek R1 (8k/1k) at FP4.',
    href: '/inference?preset=gb200-vs-b200',
    tags: ['DeepSeek', 'GB200', 'B200', 'Dynamo', 'FP4', 'NVL72'],
  },
  {
    title: 'B200 vs H200 — Blackwell vs Hopper',
    description:
      'Blackwell B200 vs Hopper H200 Dynamo TRT throughput per GPU on DeepSeek R1 at FP8.',
    href: '/inference?preset=b200-vs-h200',
    tags: ['DeepSeek', 'B200', 'H200', 'Dynamo', 'FP8'],
  },
  {
    title: 'AMD MI300X → MI325X → MI355X',
    description:
      'Three generations of AMD Instinct on SGLang at FP8. Generational throughput scaling.',
    href: '/inference?preset=amd-generations',
    tags: ['DeepSeek', 'MI300X', 'MI325X', 'MI355X', 'SGLang', 'FP8'],
  },
  {
    title: 'H100 vs GB300 Disagg — DeepSeek',
    description: 'H100 FP8 disagg vs GB300 FP8 disagg vs GB300 FP4 disagg on DeepSeek R1.',
    href: '/inference?preset=h100-vs-gb300-disagg',
    tags: ['DeepSeek', 'H100', 'GB300', 'Disagg', 'FP8', 'FP4'],
  },
  {
    title: 'Disagg B200 SGLang vs MI355X vs B200 TRT',
    description:
      'Disaggregated B200 Dynamo SGLang vs MI355X MoRI SGLang vs B200 Dynamo TRT at FP8.',
    href: '/inference?preset=disagg-b200-vs-mi355x',
    tags: ['DeepSeek', 'B200', 'MI355X', 'Disagg', 'FP8'],
  },
  {
    title: 'MI355X SGLang Disagg Over Time',
    description: 'MI355X SGLang disaggregated inference on DeepSeek R1 FP8 — throughput over time.',
    href: '/inference?preset=mi355x-sglang-disagg-timeline',
    tags: ['DeepSeek', 'MI355X', 'SGLang', 'FP8', 'Timeline'],
  },
];

const FEATURED_QUOTE = {
  text: 'InferenceMAX highlights workloads that the ML community cares about. At NVIDIA, we welcome these comparisons because they underscore the advantage of our full-stack approach — from GPU hardware to NVLink networking to NVL72 Rack Scale to Dynamo disaggregated serving.',
  name: 'Ian Buck',
  title: 'VP & GM, Hyperscale, NVIDIA & Inventor of CUDA',
};

export const metadata: Metadata = {
  title: 'Landing Variant H — Full Preset Cards + Tags',
  description:
    'InferenceX landing page variant with full-width tagged preset cards mirroring the OG layout.',
  alternates: { canonical: `${SITE_URL}/landing/status` },
};

export default function VariantH() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              InferenceX
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Compare GPU inference performance. For real.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Every model, GPU, framework, and metric. Fully configurable inference benchmark charts
              with date ranges, concurrency sweeps, and raw data export.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <Link
                href="/inference"
                className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-brand/90 transition-colors"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="https://github.com/SemiAnalysisAI/InferenceX"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Star on GitHub →
              </Link>
            </div>
          </header>

          {/* All 6 presets with full tags */}
          <section className="grid gap-4 md:grid-cols-2" aria-label="Quick comparisons">
            {PRESETS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group relative rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5"
              >
                <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all group-hover:bg-brand group-hover:inset-y-2" />
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                    {p.title}
                  </h2>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{p.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground group-hover:border-brand/30 group-hover:text-foreground/80 transition-colors"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </section>

          {/* Quote */}
          <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
            <Quote className="h-4 w-4 text-brand mb-2" />
            <p className="text-sm leading-6 text-foreground italic">
              &ldquo;{FEATURED_QUOTE.text}&rdquo;
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              — {FEATURED_QUOTE.name}, {FEATURED_QUOTE.title}
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/quotes" className="hover:text-foreground transition-colors">
              Supporters →
            </Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Articles →
            </Link>
            <Link href="/reliability" className="hover:text-foreground transition-colors">
              GPU Reliability →
            </Link>
            <Link
              href="https://newsletter.semianalysis.com"
              className="hover:text-foreground transition-colors"
            >
              Newsletter →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
