import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const PARTNERS = [
  {
    tier: 'Hardware',
    name: 'GPU Manufacturers',
    description:
      'We work directly with NVIDIA, AMD, and emerging accelerator vendors to ensure our benchmarks use optimal configurations and reflect real-world deployment patterns.',
    contributions: ['Early access hardware', 'Driver optimization guidance', 'Reference configs'],
  },
  {
    tier: 'Framework',
    name: 'Inference Frameworks',
    description:
      'Close collaboration with vLLM, TensorRT-LLM, SGLang, and other framework teams ensures we benchmark the latest optimizations as they land.',
    contributions: ['Nightly builds', 'Performance tuning', 'Bug reports & fixes'],
  },
  {
    tier: 'Cloud',
    name: 'Infrastructure Providers',
    description:
      'Bare-metal and cloud partners provide the compute resources that power our continuous benchmark pipeline across multiple GPU generations.',
    contributions: ['Dedicated clusters', 'Network isolation', 'Hardware refresh cycles'],
  },
];

export const metadata: Metadata = {
  title: 'Partners',
  description:
    'InferenceX partners with GPU manufacturers, inference framework teams, and infrastructure providers to deliver unbiased benchmark data.',
  alternates: { canonical: `${SITE_URL}/landing/partners` },
  openGraph: {
    title: 'Partners | InferenceX',
    description:
      'GPU manufacturers, framework teams, and infrastructure providers powering InferenceX.',
    url: `${SITE_URL}/landing/partners`,
  },
};

export default function PartnersPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Partners
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Independent benchmarks, collaborative relationships.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              We partner with hardware vendors, framework developers, and infrastructure providers —
              but our results are never influenced by these relationships. Partners help us access
              hardware and optimize configs; the data remains independent.
            </p>
          </header>

          <section className="grid gap-4 lg:grid-cols-3" aria-label="Partner tiers">
            {PARTNERS.map((partner) => (
              <article
                key={partner.tier}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  {partner.tier}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {partner.name}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {partner.description}
                </p>
                <ul className="mt-4 space-y-1.5">
                  {partner.contributions.map((c) => (
                    <li key={c} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-brand" />
                      {c}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Interested in partnering with InferenceX? We&apos;re always looking for hardware access
            and framework collaborations that help us expand our benchmark coverage.
          </p>
        </Card>
      </div>
    </main>
  );
}
