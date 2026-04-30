import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { FAQ_ITEMS } from '@/components/about/faq-data';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

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
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          {/* Hero */}
          <header>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              About InferenceX
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Open Source Continuous Inference Benchmark trusted by Operators of Trillion Dollar
              GigaWatt Scale Token Factories
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              As the world progresses exponentially towards AGI, software development and model
              releases move at the speed of light. Existing benchmarks rapidly become obsolete due
              to their static nature, and participants often submit software images purpose-built
              for the benchmark itself which do not reflect real world performance.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              <strong className="text-foreground">InferenceX&trade;</strong> (formerly InferenceMAX)
              is our independent, vendor neutral, reproducible benchmark which addresses these
              issues by continuously benchmarking inference software across a wide range of AI
              accelerators that are actually available to the ML community.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Our open data &amp; insights are widely adopted by the ML community, capacity planning
              strategy teams at trillion dollar token factories &amp; AI Labs &amp; at multiple
              billion dollar NeoClouds. Learn more in our articles:{' '}
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
          </header>

          {/* FAQ */}
          <section aria-label="Frequently asked questions">
            <h2 className="mb-6 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Frequently Asked Questions
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {FAQ_ITEMS.map((item) => (
                <article
                  key={item.question}
                  className="rounded-2xl border border-border/40 bg-background/20 p-5"
                >
                  <h3 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
                    {item.question}
                  </h3>
                  {item.answer && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
                    <ul className="mt-3 space-y-1.5">
                      {item.list.map((li) => (
                        <li
                          key={li}
                          className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
                        >
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                          {li}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        </Card>
      </div>
    </main>
  );
}
