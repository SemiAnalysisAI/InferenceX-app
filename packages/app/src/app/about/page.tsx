import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { FAQ_ITEMS } from '@/components/about/faq-data';
import { JsonLd } from '@/components/json-ld';
import { GITHUB_OWNER, GITHUB_REPO, SITE_URL } from '@semianalysisai/inferencex-constants';

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: [item.answer, item.link?.text, ...(item.list ?? [])].filter(Boolean).join(' '),
    },
  })),
};

export const metadata: Metadata = {
  title: 'About',
  description:
    'InferenceX is an independent, vendor neutral, reproducible benchmark which continuously benchmarks inference software across a wide range of AI accelerators.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'About | InferenceX',
    description:
      'InferenceX is an independent, vendor neutral, reproducible benchmark which continuously benchmarks inference software across a wide range of AI accelerators.',
    url: `${SITE_URL}/about`,
  },
  twitter: {
    title: 'About | InferenceX',
    description:
      'InferenceX is an independent, vendor neutral, reproducible benchmark which continuously benchmarks inference software across a wide range of AI accelerators.',
  },
};

export default function AboutPage() {
  return (
    <main className="relative">
      <JsonLd data={faqJsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4 pb-8">
        <section>
          <Card>
            <h2 className="text-lg font-semibold mb-2">
              Open Source Continuous Inference Benchmark trusted by Operators of Trillion Dollar
              GigaWatt Scale Token Factories
            </h2>
            <p className="text-muted-foreground mb-2">
              As the world progresses exponentially towards AGI, software development and model
              releases move at the speed of light. Existing benchmarks rapidly become obsolete due
              to their static nature, and participants often submit software images purpose-built
              for the benchmark itself which do not reflect real world performance.
            </p>
            <p className="text-muted-foreground mb-2">
              <strong>InferenceX&trade;</strong> (formerly InferenceMAX) is our independent, vendor
              neutral, reproducible benchmark which addresses these issues by continuously
              benchmarking inference software across a wide range of AI accelerators that are
              actually available to the ML community.
            </p>
            <p className="text-muted-foreground">
              Our open data & insights are widely adopted by the ML community, capacity planning
              strategy teams at trillion dollar token factories & AI Labs & at multiple billion
              dollar NeoClouds. Learn more in our articles:{' '}
              <Link
                href="/blog/inferencemax-open-source-inference-benchmarking"
                className="text-brand hover:underline font-medium"
              >
                InferenceX v1
              </Link>
              ,{' '}
              <Link
                href="/blog/inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper"
                className="text-brand hover:underline font-medium"
              >
                InferenceX v2
              </Link>
              .
            </p>
          </Card>
        </section>

        <section id="reproducibility" className="scroll-mt-24">
          <Card>
            <h2 className="text-lg font-semibold mb-2">Reproducibility</h2>
            <p className="text-muted-foreground mb-4">
              Every data point on the dashboard is the output of a public GitHub Actions workflow
              run. The recipe, logs, artifacts, and the resulting database row are all linked end to
              end, so anyone can audit, rerun, or fork a benchmark.
            </p>
            <ol className="space-y-3 text-sm text-muted-foreground mb-4">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  1
                </span>
                <div>
                  <strong className="text-foreground">Recipe in repo.</strong> Every combination of
                  hardware, framework, model, and precision is a shell script committed to the
                  public repo. The exact image, command line, and parallelism are pinned in source.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  2
                </span>
                <div>
                  <strong className="text-foreground">Run on real hardware.</strong> GitHub Actions
                  schedules the workflow on the actual target accelerator (NVIDIA, AMD, etc.) and
                  streams the full job log publicly while it runs.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  3
                </span>
                <div>
                  <strong className="text-foreground">Artifacts uploaded.</strong> Request
                  latencies, token counts, GPU power telemetry, and evaluation samples are attached
                  to the run page. GitHub Actions retains them for 90 days, and a weekly snapshot of
                  the full benchmark database is published as a public GitHub Release for longer
                  auditability.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  4
                </span>
                <div>
                  <strong className="text-foreground">Ingested into the dashboard.</strong>{' '}
                  Successful runs are loaded into the database and surfaced here. Every chart
                  tooltip carries a direct link back to the GitHub Actions run that produced the
                  point. Click any point to audit the source.
                </div>
              </li>
            </ol>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions?query=branch%3Amain+event%3Apush`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                Browse workflow runs
              </Link>
              <Link
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/main/benchmarks`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                View benchmark recipes
              </Link>
              <Link
                href="https://github.com/SemiAnalysisAI/InferenceX-app/releases?q=db-dump"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                Weekly DB dumps
              </Link>
              <Link
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                Source repository
              </Link>
            </div>
          </Card>
        </section>

        <section>
          <Card>
            <h2 className="text-lg font-semibold mb-4">Frequently Asked Questions</h2>
            <dl className="divide-y divide-border">
              {FAQ_ITEMS.map((item) => (
                <div key={item.question} className="py-4 first:pt-0 last:pb-0">
                  <dt className="font-medium mb-1">{item.question}</dt>
                  <dd className="text-muted-foreground text-sm">
                    {item.answer && (
                      <p>
                        {item.answer}
                        {item.link && (
                          <>
                            {' '}
                            <a
                              href={item.link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:underline font-medium"
                            >
                              {item.link.text}
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {item.list && (
                      <ul className="mt-1.5 ml-8 list-disc space-y-0.5">
                        {item.list.map((li) => (
                          <li key={li}>{li}</li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      </div>
    </main>
  );
}
