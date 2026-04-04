import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const FAQS = [
  {
    category: 'Data',
    question: 'How often are benchmarks updated?',
    answer:
      'We run benchmarks daily on a cron schedule. New results appear on the dashboard within hours of completion. Historical data is preserved indefinitely so you can track performance changes over time.',
  },
  {
    category: 'Data',
    question: 'Can I download the raw benchmark data?',
    answer:
      'Yes. The API is public and returns raw database rows with no presentation logic. You can also query our open-source database schema directly for custom analysis.',
  },
  {
    category: 'Methodology',
    question: 'Why do your numbers differ from vendor specs?',
    answer:
      'Vendor specs typically show peak single-request performance. We benchmark under realistic concurrency, sustained load, and mixed input/output lengths — conditions that reveal bottlenecks invisible in idealized tests.',
  },
  {
    category: 'Methodology',
    question: 'What metrics do you measure?',
    answer:
      'Time to first token (TTFT), time per output token (TPOT), inter-token latency (ITL), end-to-end latency, and throughput — all at P50, P99, and tail percentiles under varying concurrency levels.',
  },
  {
    category: 'Hardware',
    question: 'Which GPUs do you benchmark?',
    answer:
      'NVIDIA GB200, H200, H100 (SXM and PCIe), A100, L40S, and AMD MI300X, MI325X, MI355X. We add new hardware within weeks of availability and retire legacy GPUs when they leave mainstream deployment.',
  },
  {
    category: 'Hardware',
    question: 'Can I run InferenceX on my own GPUs?',
    answer:
      'Absolutely. The benchmark runner is open source and designed to be self-hostable. Fork the repo, point it at your hardware, and compare your results against our published data.',
  },
  {
    category: 'Platform',
    question: 'Is InferenceX free?',
    answer:
      'Yes, completely. The dashboard, API, and all underlying code are open source under Apache 2.0. No registration, no API keys, no usage limits.',
  },
  {
    category: 'Platform',
    question: 'How can I contribute?',
    answer:
      'Open a PR on GitHub. We welcome new model configs, GPU additions, framework integrations, dashboard features, and methodology improvements. PRs are reviewed within 48 hours.',
  },
];

const CATEGORIES = [...new Set(FAQS.map((f) => f.category))];

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about InferenceX — benchmark methodology, data access, supported hardware, and how to contribute.',
  alternates: { canonical: `${SITE_URL}/landing/faq` },
  openGraph: {
    title: 'FAQ | InferenceX',
    description: 'Common questions about InferenceX benchmarks, data, and methodology.',
    url: `${SITE_URL}/landing/faq`,
  },
};

export default function FAQPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">FAQ</p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Questions we hear a lot.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Everything you need to know about InferenceX — from how we measure performance to how
              you can contribute. Can&apos;t find your answer? Open an issue on GitHub.
            </p>
          </header>

          {CATEGORIES.map((category) => (
            <section key={category} aria-label={`${category} questions`}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
                {category}
              </h2>
              <div className="space-y-4">
                {FAQS.filter((f) => f.category === category).map((faq) => (
                  <article
                    key={faq.question}
                    className="rounded-2xl border border-border/40 bg-background/20 p-5"
                  >
                    <h3 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
                      {faq.question}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Still have questions? The fastest way to get answers is to open a GitHub issue. Our team
            monitors issues daily and most questions are answered within 24 hours.
          </p>
        </Card>
      </div>
    </main>
  );
}
