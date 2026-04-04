import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const RELEASES = [
  {
    version: 'v2.4.0',
    date: 'April 2026',
    title: 'Disaggregated Serving Metrics',
    changes: [
      'Added per-prefill and per-decode GPU throughput metrics',
      'New disagg caveat banners on affected charts',
      'TCO calculator now supports disaggregated configs',
    ],
  },
  {
    version: 'v2.3.0',
    date: 'March 2026',
    title: 'Historical Trends Overhaul',
    changes: [
      'Spline-interpolated trend lines for smoother GPU timeseries',
      'Comparison date picker for side-by-side performance deltas',
      'Interactive zooming with persistent zoom state across tab switches',
    ],
  },
  {
    version: 'v2.2.0',
    date: 'February 2026',
    title: 'Evaluation Tab Launch',
    changes: [
      'New evaluation benchmarks tab with accuracy vs speed tradeoffs',
      'MMLU, HumanEval, and GSM8K integration',
      'Sidebar legend with model-level filtering',
    ],
  },
  {
    version: 'v2.1.0',
    date: 'January 2026',
    title: 'AMD MI355X Support',
    changes: [
      'Full benchmark coverage for AMD Instinct MI355X',
      'ROCm framework compatibility validated',
      'Added to GPU specs comparison table',
    ],
  },
  {
    version: 'v2.0.0',
    date: 'December 2025',
    title: 'Platform Rewrite',
    changes: [
      'Migrated from Create React App to Next.js 16 App Router',
      'D3.js chart library rewritten with 4-effect architecture',
      'React Query data layer with automatic cache invalidation',
      'New dark-glass design system with circuit background',
    ],
  },
];

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'InferenceX changelog — new features, GPU additions, framework updates, and platform improvements.',
  alternates: { canonical: `${SITE_URL}/landing/changelog` },
  openGraph: {
    title: 'Changelog | InferenceX',
    description: 'Track every InferenceX platform update, new GPU, and feature release.',
    url: `${SITE_URL}/landing/changelog`,
  },
};

export default function ChangelogPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Changelog
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              What&apos;s new in InferenceX.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              A chronological record of features, improvements, and new hardware support. We ship
              updates daily — this page captures the highlights.
            </p>
          </header>

          <section className="space-y-4" aria-label="Release history">
            {RELEASES.map((release) => (
              <article
                key={release.version}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                    {release.version}
                  </span>
                  <span className="text-xs text-muted-foreground">{release.date}</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {release.title}
                </h2>
                <ul className="mt-4 space-y-1.5">
                  {release.changes.map((change) => (
                    <li
                      key={change}
                      className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
                    >
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                      {change}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            For the full commit history, visit our open-source repository on GitHub. Automated
            release notes are generated for every deployment.
          </p>
        </Card>
      </div>
    </main>
  );
}
