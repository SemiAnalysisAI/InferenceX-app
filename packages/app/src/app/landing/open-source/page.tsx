import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const PRESETS_LEFT = [
  {
    title: 'GB200 NVL72 vs B200',
    description: 'Multi vs Single Node — Dynamo TRT on DeepSeek R1 at FP4.',
    href: '/inference?preset=gb200-vs-b200',
  },
  {
    title: 'B200 vs H200',
    description: 'Blackwell vs Hopper — throughput per GPU at FP8.',
    href: '/inference?preset=b200-vs-h200',
  },
  {
    title: 'AMD MI300X → MI355X',
    description: 'Three generations of AMD Instinct on SGLang at FP8.',
    href: '/inference?preset=amd-generations',
  },
];

const PRESETS_RIGHT = [
  {
    title: 'H100 vs GB300 Disagg',
    description: 'Cross-generation disagg comparison on DeepSeek R1.',
    href: '/inference?preset=h100-vs-gb300-disagg',
  },
  {
    title: 'Disagg B200 vs MI355X',
    description: 'Cross-vendor disaggregated serving at FP8.',
    href: '/inference?preset=disagg-b200-vs-mi355x',
  },
  {
    title: 'MI355X Over Time',
    description: 'SGLang disagg throughput improvements on DeepSeek R1.',
    href: '/inference?preset=mi355x-sglang-disagg-timeline',
  },
];

const NAV_SECTIONS = [
  {
    heading: 'Explore',
    links: [
      { label: 'Full Dashboard', href: '/inference' },
      { label: 'Supporters', href: '/quotes' },
      { label: 'Articles', href: '/blog' },
    ],
  },
  {
    heading: 'Contribute',
    links: [
      { label: 'GitHub — Benchmarks', href: 'https://github.com/SemiAnalysisAI/InferenceX' },
      { label: 'GitHub — Frontend', href: 'https://github.com/SemiAnalysisAI/InferenceX-app' },
      { label: 'GPU Reliability', href: '/reliability' },
    ],
  },
  {
    heading: 'SemiAnalysis',
    links: [
      { label: 'Main Site', href: 'https://semianalysis.com' },
      { label: 'Newsletter', href: 'https://newsletter.semianalysis.com' },
      { label: 'About', href: 'https://semianalysis.com/about/' },
    ],
  },
];

export const metadata: Metadata = {
  title: 'Landing Variant D — Split Presets + Nav',
  description: 'InferenceX landing page variant with two-column presets and navigation sections.',
  alternates: { canonical: `${SITE_URL}/landing/open-source` },
};

export default function VariantD() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              InferenceX by SemiAnalysis
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Every model, GPU, framework, and metric.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Fully configurable inference benchmark charts with date ranges, concurrency sweeps,
              and raw data export. Compare NVIDIA B200, H200, H100, AMD MI355X, MI325X, MI300X and
              more across DeepSeek, gpt-oss, Llama, Qwen, and other models.
            </p>
          </header>

          {/* Two-column presets */}
          <section className="grid gap-6 md:grid-cols-2" aria-label="Quick comparisons">
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                NVIDIA Comparisons
              </h2>
              {PRESETS_LEFT.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group flex items-start justify-between rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                      {p.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                Cross-Vendor &amp; Timeline
              </h2>
              {PRESETS_RIGHT.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group flex items-start justify-between rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                      {p.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>

          {/* Nav sections */}
          <section className="grid gap-4 md:grid-cols-3" aria-label="Navigation">
            {NAV_SECTIONS.map((s) => (
              <div key={s.heading} className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  {s.heading}
                </h3>
                <ul className="mt-3 space-y-2">
                  {s.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-sm text-foreground hover:text-brand transition-colors"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </Card>
      </div>
    </main>
  );
}
