'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES } from '@/components/quotes/quotes-data';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { track } from '@/lib/analytics';

const CAROUSEL_QUOTES = QUOTES.filter((q) =>
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
  ].includes(q.org),
);

const CAROUSEL_OVERRIDES = {
  order: ['OpenAI'],
  labels: {
    'Together AI': 'Tri Dao',
    'PyTorch Foundation': 'PyTorch',
  },
};

export function LandingPage() {
  useEffect(() => {
    track('landing_page_viewed');
  }, []);

  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col items-center">
        {/* Hero */}
        <section className="text-center pt-10 pb-6 lg:pt-14 lg:pb-8 max-w-4xl">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
            Open Source Continuous Inference Benchmark
          </h1>
          <p className="text-muted-foreground mt-4 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            <strong>InferenceX&trade;</strong> independently benchmarks AI inference across GPUs and
            frameworks in real time. Trusted by operators of trillion-dollar token factories, AI
            labs, and neoclouds.{' '}
            <a
              href="https://newsletter.semianalysis.com/p/inferencemax-open-source-inference"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline font-medium"
            >
              Learn more
            </a>
            .
          </p>
        </section>

        {/* Quotes */}
        <section className="w-full max-w-4xl pb-8">
          <Card className="py-5 px-4 sm:px-6">
            <QuoteCarousel
              quotes={CAROUSEL_QUOTES}
              overrides={CAROUSEL_OVERRIDES}
              moreHref="/quotes"
            />
          </Card>
        </section>

        {/* CTA */}
        <section className="pb-10">
          <Link href="/inference" onClick={() => track('landing_full_dashboard_clicked')}>
            <Button size="lg" className="text-sm sm:text-base px-8 h-12 gap-2">
              Explore Full Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </section>

        {/* Curated Views */}
        <section className="w-full max-w-5xl pb-12">
          <h2 className="text-lg font-semibold mb-5 text-center">Popular Comparisons</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FAVORITE_PRESETS.map((preset) => (
              <CuratedViewCard key={preset.id} preset={preset} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
