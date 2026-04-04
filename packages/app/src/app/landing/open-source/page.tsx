import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const REPOS = [
  {
    name: 'InferenceX App',
    language: 'TypeScript',
    description:
      'The dashboard you are looking at right now. Next.js 16, D3.js charts, React Query, and Tailwind CSS. Every chart, filter, and data pipeline is open for inspection and contribution.',
    stars: '1.2k',
  },
  {
    name: 'InferenceX Runner',
    language: 'Python',
    description:
      'The benchmark orchestrator. Handles GPU provisioning, framework deployment, load generation, and result collection. Designed to be self-hostable on your own hardware.',
    stars: '890',
  },
  {
    name: 'InferenceX Configs',
    language: 'YAML',
    description:
      'Every benchmark configuration ever run — model parameters, serving configs, hardware specs. Full provenance for every data point on the dashboard.',
    stars: '340',
  },
];

const PRINCIPLES = [
  {
    title: 'Fork It',
    description: 'Run our benchmarks on your own hardware. Compare your results against ours.',
  },
  {
    title: 'Fix It',
    description: 'Found a bug or methodology flaw? PRs are welcome. We review within 48 hours.',
  },
  {
    title: 'Extend It',
    description:
      'Add new models, GPUs, or frameworks. The architecture is designed for extensibility.',
  },
];

export const metadata: Metadata = {
  title: 'Open Source',
  description:
    'InferenceX is fully open source under Apache 2.0. Explore our repositories, contribute benchmarks, and run tests on your own hardware.',
  alternates: { canonical: `${SITE_URL}/landing/open-source` },
  openGraph: {
    title: 'Open Source | InferenceX',
    description: 'InferenceX is fully open source under Apache 2.0.',
    url: `${SITE_URL}/landing/open-source`,
  },
};

export default function OpenSourcePage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Open Source
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Trust is earned in the open.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Benchmark data is only as credible as its source. That&apos;s why every line of code,
              every configuration, and every data pipeline behind InferenceX is open source. Verify
              our methodology. Reproduce our results. Hold us accountable.
            </p>
          </header>

          <section className="grid gap-4 lg:grid-cols-3" aria-label="Repositories">
            {REPOS.map((repo) => (
              <article
                key={repo.name}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {repo.language}
                  </p>
                  <span className="text-xs text-muted-foreground">{repo.stars} stars</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {repo.name}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{repo.description}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 md:grid-cols-3" aria-label="Contribution principles">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
                <h3 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{p.description}</p>
              </div>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Licensed under Apache 2.0. Use our data, fork our code, and build something better. The
            AI ecosystem benefits when performance data is free.
          </p>
        </Card>
      </div>
    </main>
  );
}
