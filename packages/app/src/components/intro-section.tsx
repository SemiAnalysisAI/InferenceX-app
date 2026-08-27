import { SupportersStrip } from '@/components/supporters-strip';
import { QUOTES, CAROUSEL_ORGS, CAROUSEL_LABELS } from '@/components/quotes/quotes-data';
import type { Locale } from '@/lib/i18n';

// Strip order follows QUOTES order — supporter orgs are listed first there.
const supporterOrgs = [
  ...new Set(
    QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org)).map((q) => q.org),
  ),
].map((org) => CAROUSEL_LABELS[org] ?? org);

const STRINGS = {
  en: {
    kicker: 'Trusted by GigaWatt token factories',
    heading: 'Open-source continuous agentic inference benchmarking.',
  },
  zh: {
    kicker: '获得吉瓦级 token 工厂运营方的信赖',
    heading: 'InferenceX 提供持续更新的开源智能体推理基准测试。',
  },
} as const;

export function IntroSection({ locale = 'en' }: { locale?: Locale } = {}) {
  const isZh = locale === 'zh';
  const t = STRINGS[locale];
  return (
    <section className="py-8 md:py-12">
      {/* Mint-tinted supporters band: quote text lives on /quotes now — the
          band keeps just the org strip and a link out, saving vertical space. */}
      <div
        data-testid="intro-section"
        className="rounded-2xl bg-accent px-5 py-8 md:px-10 md:py-10 dark:bg-card dark:border dark:border-border"
      >
        <p className="text-sm font-medium text-muted-foreground">{t.kicker}</p>
        <h2 className="mt-2 max-w-3xl text-2xl/8 font-semibold tracking-[-0.01em] text-foreground md:text-3xl/9">
          {t.heading}
        </h2>
        <div className="mt-8">
          <SupportersStrip
            orgs={supporterOrgs}
            moreHref={isZh ? '/zh/quotes' : '/quotes'}
            moreLabel={isZh ? '查看完整评价与更多支持者 →' : undefined}
          />
        </div>
      </div>
    </section>
  );
}
