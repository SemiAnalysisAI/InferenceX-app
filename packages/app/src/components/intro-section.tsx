import { Card } from '@/components/ui/card';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES, CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';

export function IntroSection() {
  return (
    <section>
      <Card data-testid="intro-section">
        <QuoteCarousel
          quotes={QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org))}
          overrides={{
            order: ['OpenAI'],
            labels: CAROUSEL_LABELS,
          }}
          moreHref="/quotes"
        />
      </Card>
    </section>
  );
}
