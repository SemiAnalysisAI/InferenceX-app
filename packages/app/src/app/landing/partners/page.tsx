import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const SUPPORTERS = [
  'OpenAI',
  'NVIDIA',
  'AMD',
  'Microsoft',
  'Together AI',
  'vLLM',
  'GPU Mode',
  'PyTorch Foundation',
  'Oracle',
  'CoreWeave',
  'Nebius',
  'Crusoe',
  'TensorWave',
  'SGLang',
  'WEKA',
  'Stanford',
  'Core42',
  'Meta',
  'Hugging Face',
  'UC Berkeley',
  'Lambda',
  'UC San Diego',
];

const FEATURED_QUOTE = {
  text: "As we build systems at unprecedented scale, it's critical for the ML community to have open, transparent benchmarks that reflect how inference really performs across hardware and software. InferenceMAX's head-to-head benchmarks cut through the noise and provide a living picture of token throughput, performance per dollar, and tokens per Megawatt.",
  name: 'Peter Hoeschele',
  title: 'VP of Infrastructure and Industrial Compute, OpenAI Stargate',
};

export const metadata: Metadata = {
  title: 'Landing Variant E — Supporters Wall',
  description: 'InferenceX landing page variant with a supporter logo wall and featured quote.',
  alternates: { canonical: `${SITE_URL}/landing/partners` },
};

export default function VariantE() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              InferenceX
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Trusted by the companies building AI infrastructure.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Compare AI inference performance across GPUs and frameworks. Real benchmarks on NVIDIA
              GB200, B200, AMD MI355X, and more. Free, open-source, continuously updated.
            </p>
          </header>

          {/* Supporter wall */}
          <section aria-label="Supporters">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Supported By 36+ Industry Leaders
            </h2>
            <div className="flex flex-wrap gap-2">
              {SUPPORTERS.map((org) => (
                <span
                  key={org}
                  className="rounded-full border border-border/40 bg-background/20 px-4 py-2 text-sm font-medium text-foreground"
                >
                  {org}
                </span>
              ))}
            </div>
          </section>

          {/* Featured quote */}
          <section
            className="rounded-2xl border border-brand/20 bg-brand/5 p-6 md:p-8"
            aria-label="Featured quote"
          >
            <Quote className="h-5 w-5 text-brand mb-3" />
            <p className="text-sm leading-6 text-foreground italic md:text-base">
              &ldquo;{FEATURED_QUOTE.text}&rdquo;
            </p>
            <div className="mt-4 border-t border-brand/20 pt-3">
              <p className="text-sm font-semibold text-foreground">{FEATURED_QUOTE.name}</p>
              <p className="text-xs text-muted-foreground">{FEATURED_QUOTE.title}</p>
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
              See all supporters →
            </Link>
            <Link
              href="https://github.com/SemiAnalysisAI/InferenceX"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Star on GitHub →
            </Link>
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Read Articles →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
