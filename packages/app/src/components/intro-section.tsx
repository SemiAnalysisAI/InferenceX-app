import { Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MinecraftSplash } from '@/components/minecraft/minecraft-splash';
import { QuoteCarousel } from '@/components/quote-carousel';
import { QUOTES, CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';
import type { Locale } from '@/lib/i18n';

// Carousel order follows QUOTES order — carousel orgs are listed first there.
const carouselQuotes = QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org));

const CAROUSEL_OVERRIDES = {
  labels: CAROUSEL_LABELS,
};

const HEADING = {
  en: 'Open Source Continuous Inference Benchmark Trusted by GigaWatt Token Factories',
  zh: '受吉瓦级 token 工厂信赖的开源持续推理基准测试',
} as const;

export function IntroSection({ locale = 'en' }: { locale?: Locale } = {}) {
  const isZh = locale === 'zh';
  // Quotes fall back to the English original until a translation lands.
  const quotes = isZh
    ? carouselQuotes.map((q) => ({ ...q, text: q.textZh ?? q.text }))
    : carouselQuotes;
  return (
    <section>
      <Card data-testid="intro-section">
        <div className="relative flex items-start gap-2 mb-4">
          <Quote className="size-5 shrink-0 mt-1 text-brand" />
          <h2 className="text-lg font-semibold">{HEADING[locale]}</h2>
          <MinecraftSplash />
        </div>
        <div>
          <QuoteCarousel
            quotes={quotes}
            overrides={CAROUSEL_OVERRIDES}
            moreHref={isZh ? '/zh/quotes' : '/quotes'}
            moreLabel={isZh ? '查看更多支持者 →' : undefined}
          />
        </div>
      </Card>
    </section>
  );
}
