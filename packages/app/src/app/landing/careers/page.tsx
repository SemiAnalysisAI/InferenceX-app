import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const QUOTES = [
  {
    text: 'Inference demand is growing exponentially, driven by long-context reasoning. NVIDIA Grace Blackwell NVL72 was invented for this new era of thinking AI.',
    name: 'Jensen Huang',
    title: 'Founder & CEO, NVIDIA',
    org: 'NVIDIA',
  },
  {
    text: 'Our mission at Azure is to give customers the most performant, efficient, and cost-effective cloud for AI. SemiAnalysis InferenceMAX supports that mission by providing transparent, reproducible benchmarks.',
    name: 'Scott Guthrie',
    title: 'EVP Cloud & AI, Microsoft',
    org: 'Microsoft',
  },
  {
    text: "Speed is the moat. InferenceMAX's nightly benchmarks match the speed of improvement of the AMD software stack.",
    name: 'Anush Elangovan',
    title: 'VP GPU Software, AMD',
    org: 'AMD',
  },
];

const PRESETS = [
  { title: 'GB200 vs B200', href: '/inference?preset=gb200-vs-b200' },
  { title: 'B200 vs H200', href: '/inference?preset=b200-vs-h200' },
  { title: 'AMD Generations', href: '/inference?preset=amd-generations' },
  { title: 'H100 vs GB300', href: '/inference?preset=h100-vs-gb300-disagg' },
  { title: 'Disagg Cross-Vendor', href: '/inference?preset=disagg-b200-vs-mi355x' },
  { title: 'MI355X Timeline', href: '/inference?preset=mi355x-sglang-disagg-timeline' },
];

export const metadata: Metadata = {
  title: 'Landing Variant F — Quote Cards + Compact Presets',
  description: 'InferenceX landing page variant with three quote cards and compact preset links.',
  alternates: { canonical: `${SITE_URL}/landing/careers` },
};

export default function VariantF() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              InferenceX by SemiAnalysis
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Open Source Continuous Inference Benchmark
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Compare AI inference performance across GPUs and frameworks. Real benchmarks on NVIDIA
              GB200, B200, AMD MI355X, and more. Trusted by trillion dollar AI infrastructure
              operators like OpenAI, Oracle, Microsoft.
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

          {/* Quote cards */}
          <section className="grid gap-4 lg:grid-cols-3" aria-label="Supporter quotes">
            {QUOTES.map((q) => (
              <article
                key={q.name}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <Quote className="h-4 w-4 text-brand mb-2" />
                <p className="text-sm leading-6 text-muted-foreground italic">
                  &ldquo;{q.text}&rdquo;
                </p>
                <div className="mt-4 border-t border-border/30 pt-3">
                  <p className="text-sm font-semibold text-foreground">{q.name}</p>
                  <p className="text-xs text-muted-foreground">{q.title}</p>
                </div>
              </article>
            ))}
          </section>

          {/* Compact preset links */}
          <section aria-label="Quick comparisons">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Quick Comparisons
            </h2>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/20 px-4 py-2 text-sm font-medium text-foreground hover:border-brand/50 hover:text-brand transition-all"
                >
                  {p.title}
                  <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Continuous open-source inference benchmarking. Real-world, reproducible, auditable
            performance data.{' '}
            <Link href="/blog" className="text-brand hover:underline">
              Read our articles
            </Link>{' '}
            or{' '}
            <Link href="https://newsletter.semianalysis.com" className="text-brand hover:underline">
              subscribe to the newsletter
            </Link>
            .
          </p>
        </Card>
      </div>
    </main>
  );
}
