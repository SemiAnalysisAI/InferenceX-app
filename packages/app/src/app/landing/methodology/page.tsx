import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const STEPS = [
  {
    step: '01',
    title: 'Hardware Provisioning',
    description:
      'Dedicated bare-metal servers with isolated GPU access. No shared tenancy, no noisy neighbors. Each benchmark run gets exclusive hardware to ensure consistent, reproducible measurements.',
  },
  {
    step: '02',
    title: 'Framework Deployment',
    description:
      'We deploy each inference framework (vLLM, TensorRT-LLM, SGLang, and others) using their recommended production configurations. No custom patches or unreleased optimizations.',
  },
  {
    step: '03',
    title: 'Load Generation',
    description:
      'Synthetic traffic that mirrors real-world patterns — variable input/output lengths, mixed concurrency levels, and sustained throughput. We measure P50, P99, and tail latencies under realistic conditions.',
  },
  {
    step: '04',
    title: 'Data Collection & Validation',
    description:
      'Automated pipelines collect TTFT, TPOT, ITL, throughput, and end-to-end latency. Outlier detection flags anomalous runs. Every data point links back to the exact config and commit that produced it.',
  },
  {
    step: '05',
    title: 'Publication',
    description:
      'Results flow into the InferenceX dashboard within hours. Historical data is preserved so you can track performance regressions and improvements across framework releases.',
  },
];

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How InferenceX benchmarks ML inference performance — hardware provisioning, load generation, data validation, and publication pipeline.',
  alternates: { canonical: `${SITE_URL}/landing/methodology` },
  openGraph: {
    title: 'Methodology | InferenceX',
    description:
      'How InferenceX benchmarks ML inference performance — from hardware provisioning to data publication.',
    url: `${SITE_URL}/landing/methodology`,
  },
};

export default function MethodologyPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Methodology
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              How we measure what matters.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Benchmarking inference is deceptively hard. A single request latency tells you almost
              nothing about production behavior. Our methodology is designed to capture the metrics
              that actually matter when you&apos;re serving millions of tokens per day.
            </p>
          </header>

          <section
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            aria-label="Methodology steps"
          >
            {STEPS.map((item) => (
              <article
                key={item.step}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  Step {item.step}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {item.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Our full methodology, including config files and load generation scripts, is available
            in our open-source repository. We welcome community review and contributions to improve
            our benchmarking process.
          </p>
        </Card>
      </div>
    </main>
  );
}
