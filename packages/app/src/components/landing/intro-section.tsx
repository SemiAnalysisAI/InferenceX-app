import { Card } from '@/components/ui/card';
import { SupportersStrip } from '@/components/landing/supporters-strip';
import {
  QUOTES,
  CAROUSEL_ORGS,
  CAROUSEL_LABELS,
  orgAnchorId,
} from '@/components/quotes/quotes-data';
import { analyticsPlacement } from '@/lib/analytics/placement';
import type { Locale } from '@/lib/i18n/i18n';

const stripOrgs = [
  ...new Set(
    QUOTES.filter((q) => (CAROUSEL_ORGS as readonly string[]).includes(q.org)).map((q) => q.org),
  ),
];

const supporterOrgs = (quotesPath: string) =>
  stripOrgs.map((org) => ({
    label: CAROUSEL_LABELS[org] ?? org,
    href: `${quotesPath}#${orgAnchorId(org)}`,
  }));

const HEADING = {
  en: 'Open-source continuous AI accelerator system benchmark trusted by gigawatt token factories',
  zh: 'InferenceX 提供持续更新的开源 AI 加速器系统基准测试，已获得吉瓦级 token 工厂运营方的信赖',
} as const;

export function IntroSection({ locale = 'en' }: { locale?: Locale } = {}) {
  const isZh = locale === 'zh';
  return (
    <section {...analyticsPlacement('landing_section')}>
      <Card data-testid="intro-section">
        <h2 className="mb-4 text-lg font-semibold text-balance">{HEADING[locale]}</h2>
        <SupportersStrip
          orgs={supporterOrgs(isZh ? '/zh/quotes' : '/quotes')}
          moreHref={isZh ? '/zh/quotes' : '/quotes'}
          moreLabel={isZh ? '查看全部评价与支持者' : undefined}
        />
      </Card>
    </section>
  );
}
