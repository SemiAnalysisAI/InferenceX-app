import { Quote } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SupportersStrip } from '@/components/supporters-strip';
import { QUOTES, CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';
import type { Locale } from '@/lib/i18n';

// Strip order follows QUOTES order — supporter orgs are listed first there.
const supporterOrgs = [
  ...new Set(
    QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org)).map((q) => q.org),
  ),
].map((org) => CAROUSEL_LABELS[org] ?? org);

const HEADING = {
  en: 'Open-Source Continuous Agentic Inference Benchmark Trusted by GigaWatt Token Factories',
  zh: 'InferenceX 提供持续更新的开源智能体推理基准测试，已获得吉瓦级 token 工厂运营方的信赖。',
} as const;

export function IntroSection({ locale = 'en' }: { locale?: Locale } = {}) {
  const isZh = locale === 'zh';
  return (
    <section>
      <Card data-testid="intro-section">
        {/* The splash moved to the AgentX hero, which now opens the landing
            page — two copies of the same announcement one scroll apart read
            as a duplicate rather than a callout. */}
        <div className="flex items-start gap-2 mb-4">
          <Quote className="size-5 shrink-0 mt-1 text-brand" />
          <h2 className="text-lg font-semibold">{HEADING[locale]}</h2>
        </div>
        {/* Quote text lives on /quotes now — the band keeps just the org
            strip and a link out, saving vertical space above the fold. */}
        <SupportersStrip
          orgs={supporterOrgs}
          moreHref={isZh ? '/zh/quotes' : '/quotes'}
          moreLabel={isZh ? '查看完整评价与更多支持者 →' : undefined}
        />
      </Card>
    </section>
  );
}
