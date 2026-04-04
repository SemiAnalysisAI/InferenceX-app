import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const PILLARS = [
  {
    label: 'Transparency',
    title: 'Open Benchmarks, Open Data',
    description:
      'Every benchmark run is fully reproducible. We publish raw configs, hardware specs, and methodology so the community can verify — and improve — our results.',
  },
  {
    label: 'Rigor',
    title: 'Production-Grade Testing',
    description:
      'We test under real-world concurrency, mixed workloads, and sustained load — not cherry-picked single-request latencies. Our benchmarks reflect what you actually experience in production.',
  },
  {
    label: 'Independence',
    title: 'No Vendor Bias',
    description:
      'We benchmark every major GPU and inference framework on equal footing. No sponsorships influence our results. The data speaks for itself.',
  },
];

export const metadata: Metadata = {
  title: 'About',
  description:
    'InferenceX is the open-source ML inference benchmark platform by SemiAnalysis. Learn about our mission to bring transparency to GPU performance.',
  alternates: { canonical: `${SITE_URL}/landing/about` },
  openGraph: {
    title: 'About | InferenceX',
    description: 'InferenceX is the open-source ML inference benchmark platform by SemiAnalysis.',
    url: `${SITE_URL}/landing/about`,
  },
};

export default function AboutPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              About InferenceX
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              The open standard for ML inference benchmarking.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Built by SemiAnalysis, InferenceX exists to answer one question: how fast is
              inference, really? We run continuous, reproducible benchmarks across every major GPU
              and framework so you can make hardware decisions based on evidence, not marketing.
            </p>
          </header>

          <section className="grid gap-4 lg:grid-cols-3" aria-label="Core pillars">
            {PILLARS.map((pillar) => (
              <article
                key={pillar.label}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  {pillar.label}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {pillar.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{pillar.description}</p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            InferenceX is open source under the Apache 2.0 license. We believe the AI ecosystem
            moves faster when performance data is freely available to everyone — researchers,
            engineers, and decision-makers alike.
          </p>
        </Card>
      </div>
    </main>
  );
}
