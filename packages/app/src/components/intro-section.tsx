import { Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MinecraftSplash } from '@/components/minecraft/minecraft-splash';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES, CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';

const carouselQuotes = QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org));

const CAROUSEL_OVERRIDES = {
  order: ['OpenAI'] as string[],
  labels: CAROUSEL_LABELS,
};

export function IntroSection() {
  return (
    <section>
      <Card data-testid="intro-section">
        <div className="relative flex items-start gap-2 mb-4">
          <Quote className="size-5 shrink-0 mt-1 text-brand" />
          <h2 className="text-lg font-semibold">
            Open Source Continuous Inference Benchmark Trusted by GigaWatt Token Factories
          </h2>
          <MinecraftSplash />
        </div>
        <div>
          <QuoteCarousel
            quotes={carouselQuotes}
            overrides={CAROUSEL_OVERRIDES}
            moreHref="/quotes"
          />
        </div>
      </Card>
    </section>
  );
}
