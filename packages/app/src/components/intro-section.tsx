import { Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES, CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';

const carouselQuotes = QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org));

/** Deduplicated logos from all quote orgs. */
const orgLogos: { org: string; logo: string }[] = [];
const seen = new Set<string>();
for (const q of QUOTES) {
  if (q.logo && !seen.has(q.org)) {
    seen.add(q.org);
    orgLogos.push({ org: q.org, logo: q.logo });
  }
}

export function IntroSection() {
  return (
    <section>
      <Card data-testid="intro-section">
        <div className="flex items-center gap-2 mb-4">
          <Quote className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Trusted by the ML Community</h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          {orgLogos.map(({ org, logo }) => (
            <div key={org} className="flex items-center justify-center h-10 px-2" title={org}>
              <img
                src={`/logos/${logo}`}
                alt={org}
                width={80}
                height={40}
                className="h-8 max-w-20 object-contain grayscale opacity-70 dark:invert"
              />
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-border">
          <QuoteCarousel
            quotes={carouselQuotes}
            overrides={{
              order: ['OpenAI'],
              labels: CAROUSEL_LABELS,
            }}
            moreHref="/quotes"
          />
        </div>
      </Card>
    </section>
  );
}
