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
