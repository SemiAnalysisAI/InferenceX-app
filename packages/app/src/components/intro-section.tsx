import { Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
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
        <div className="flex items-center gap-2 mb-4">
          <Quote className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Open Source Continuous Inference Benchmark Trusted by the Token Factories</h2>
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
