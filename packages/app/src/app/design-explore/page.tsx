import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const VARIANTS = [
  {
    id: 'A',
    route: '/landing/about',
    title: 'Hero + Grid',
    description:
      'Classic hero header with brand CTA, 3-column preset cards with tags, and a 6-pill navigation row.',
  },
  {
    id: 'B',
    route: '/landing/methodology',
    title: 'Stats + Full Presets',
    description:
      'Four stat counters (GPUs, models, frequency, open source) above all 6 curated presets in a 3-column grid.',
  },
  {
    id: 'C',
    route: '/landing/infrastructure',
    title: 'Quotes + GPU List',
    description:
      'Three executive quote cards (OpenAI, NVIDIA, AMD) with a hardware chip wall showing all benchmarked GPUs.',
  },
  {
    id: 'D',
    route: '/landing/open-source',
    title: 'Split Presets + Nav',
    description:
      'Two-column preset layout split by NVIDIA vs Cross-Vendor, plus a 3-column navigation directory.',
  },
  {
    id: 'E',
    route: '/landing/partners',
    title: 'Supporters Wall',
    description:
      'Full 22-org supporter chip wall with a featured OpenAI quote in a large brand-tinted banner.',
  },
  {
    id: 'F',
    route: '/landing/careers',
    title: 'Quote Cards + Compact Presets',
    description:
      'Three side-by-side quote cards with pill-shaped preset links and inline article/newsletter links.',
  },
  {
    id: 'G',
    route: '/landing/changelog',
    title: 'Feature Cards + Quote Banner',
    description:
      'Four large feature cards (Dashboard, Comparisons, Supporters, Articles) with hover arrows and a quote banner.',
  },
  {
    id: 'H',
    route: '/landing/status',
    title: 'Full Preset Cards + Tags',
    description:
      'All 6 presets as tagged cards with brand accent bars (matching OG CuratedViewCard style) plus an NVIDIA quote.',
  },
  {
    id: 'I',
    route: '/landing/contact',
    title: 'Section Directory',
    description:
      'Two inline quote banners above a 6-card section directory linking to Dashboard, Comparisons, Supporters, Articles, Reliability, and GitHub.',
  },
  {
    id: 'J',
    route: '/landing/faq',
    title: 'GPU Focus + Dense Layout',
    description:
      'GPU-centric hero with hardware stat cards, a chip wall, dense 3x2 preset grid, and a Jensen Huang quote.',
  },
];

export const metadata: Metadata = {
  title: 'Design Exploration — Landing Page Variants',
  description:
    'Explore 10 landing page design variants for InferenceX, each using the glass card aesthetic with real content.',
  alternates: { canonical: `${SITE_URL}/design-explore` },
};

export default function DesignExplorePage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Design Exploration
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              10 landing page variants.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Each variant uses the glass card aesthetic from the land acknowledgement page while
              showcasing the real InferenceX landing page content — quotes, preset links, GPU
              hardware, navigation, and CTAs — in a different layout.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-2" aria-label="Landing page variants">
            {VARIANTS.map((v) => (
              <Link
                key={v.id}
                href={v.route}
                className="group relative rounded-2xl border border-border/40 bg-background/20 p-5 transition-all hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5"
              >
                <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all group-hover:bg-brand group-hover:inset-y-2" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-sm font-semibold text-brand">
                      {v.id}
                    </span>
                    <h2 className="text-lg font-semibold tracking-[-0.04em] text-foreground group-hover:text-brand transition-colors">
                      {v.title}
                    </h2>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-all group-hover:translate-x-0.5" />
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{v.description}</p>
                <p className="mt-3 rounded-lg border border-border/30 bg-background/30 px-3 py-1.5 text-xs font-mono text-muted-foreground">
                  {v.route}
                </p>
              </Link>
            ))}
          </section>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Current Landing Page
            </Link>
            <Link
              href="/land-acknowledgement"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Land Acknowledgement (style reference) →
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
