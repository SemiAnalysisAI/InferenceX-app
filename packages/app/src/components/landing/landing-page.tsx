'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { LANDING_PRESETS } from '@/components/favorites/favorite-presets';
import { PresetCard } from '@/components/landing/preset-card';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES } from '@/components/quotes/quotes-data';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { track } from '@/lib/analytics';

const LANDING_QUOTES = QUOTES.filter((q) =>
  [
    'OpenAI',
    'Microsoft',
    'Together AI',
    'vLLM',
    'GPU Mode',
    'PyTorch Foundation',
    'Oracle',
    'CoreWeave',
    'Nebius',
    'Crusoe',
    'TensorWave',
    'SGLang',
    'WEKA',
    'Stanford',
    'Core42',
    'Meta Superintelligence Labs',
    'Hugging Face',
    'UC Berkeley',
  ].includes(q.org),
);

export function LandingPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-3 pb-8">
        {/* Hero */}
        <section>
          <Card data-testid="landing-hero">
            <h2 className="text-lg font-semibold mb-2">
              Open Source Continuous Inference Benchmark
            </h2>
            <p className="text-muted-foreground text-sm">
              Independent, vendor-neutral benchmarks comparing AI inference performance across GPUs
              and frameworks.
            </p>

            {/* Quote Carousel */}
            <div className="mt-4 pt-4 border-t border-foreground">
              <QuoteCarousel
                quotes={LANDING_QUOTES}
                overrides={{
                  order: ['OpenAI'],
                  labels: {
                    'Together AI': 'Tri Dao',
                    'PyTorch Foundation': 'PyTorch',
                  },
                }}
                moreHref="/quotes"
              />
            </div>
          </Card>
        </section>

        {/* CTA */}
        <section className="flex justify-center">
          <Button
            asChild
            size="lg"
            className="text-base px-8 py-6 font-semibold"
            data-testid="landing-cta"
          >
            <Link href="/inference" onClick={() => track('landing_explore_clicked')}>
              Explore Full Dashboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </section>

        {/* Curated Views */}
        <section>
          <h3 className="text-base font-semibold mb-3">Popular Comparisons</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LANDING_PRESETS.map((preset) => (
              <PresetCard key={preset.id} preset={preset} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
