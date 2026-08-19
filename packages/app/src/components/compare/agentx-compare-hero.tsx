import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { agentxDashboardHref, FEATURED_AGENTX_MODELS } from '@/lib/compare-agentx';

import { CompareIndexTrackedLink } from './compare-index-tracked-link';

const STRINGS = {
  en: {
    eyebrow: 'AgentX / live results',
    title: 'Compare real world, agentic inference results',
    description:
      'Real-world agentic inference results for Kimi K3, DeepSeek V4 Pro, MiniMax M3, Qwen 3.5, and GLM 5.2. Compare throughput, interactivity, time to first token, and cost across serving stacks and accelerator platforms.',
    overview: 'Overview',
    dashboard: 'Full dashboard',
    methodology: 'Read the full methodology',
    ledgerTitle: 'Models with AgentX results',
    modelAction: 'View results',
  },
  zh: {
    eyebrow: 'AgentX / 实时结果',
    title: '对比真实场景下的智能体推理结果',
    description:
      '查看 Kimi K3、DeepSeek V4 Pro、MiniMax M3、Qwen 3.5 与 GLM 5.2 的真实智能体推理结果，对比不同 serving stack 与加速平台的吞吐量、交互速度、首 token 延迟和成本。',
    overview: '总览',
    dashboard: '完整仪表板',
    methodology: '阅读完整方法论',
    ledgerTitle: '已有 AgentX 结果的模型',
    modelAction: '查看结果',
  },
} as const;

/**
 * The hero leads `/compare` and the landing page. `/compare` owns the page
 * `h1`; the landing page renders the hero under its own section flow, so the
 * caller picks the heading level rather than shipping a second `h1`.
 */
export function AgentXCompareHero({
  locale,
  headingLevel = 'h1',
  surface = 'compare',
}: {
  locale: 'en' | 'zh';
  headingLevel?: 'h1' | 'h2';
  surface?: 'compare' | 'landing';
}) {
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';
  const Heading = headingLevel;

  return (
    <section data-testid="compare-agentx-primary">
      <Card className="overflow-hidden p-0 md:p-0">
        <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
          <div className="flex flex-col justify-center p-6 md:p-8 lg:p-10">
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              {t.eyebrow}
            </p>
            <Heading className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-foreground lg:text-5xl">
              {t.title}
            </Heading>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground lg:text-lg">
              {t.description}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <CompareIndexTrackedLink
                data-testid="compare-agentx-overview-link"
                href={`${prefix}/overview`}
                analyticsEvent="compare_agentx_overview_clicked"
                analyticsSurface={surface}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
              >
                {t.overview}
                <ArrowRight aria-hidden="true" className="size-4" />
              </CompareIndexTrackedLink>
              <CompareIndexTrackedLink
                data-testid="compare-agentx-dashboard-link"
                href={agentxDashboardHref(locale, FEATURED_AGENTX_MODELS[0])}
                analyticsEvent="compare_agentx_dashboard_clicked"
                analyticsTarget="kimi-k3"
                analyticsSurface={surface}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {t.dashboard}
                <ArrowRight aria-hidden="true" className="size-4" />
              </CompareIndexTrackedLink>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <CompareIndexTrackedLink
                data-testid="compare-agentx-methodology-link"
                href={`${prefix}/agentx/methodology`}
                analyticsEvent="compare_agentx_methodology_clicked"
                analyticsSurface={surface}
                className="inline-flex min-h-11 items-center rounded-md border border-border px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {t.methodology}
              </CompareIndexTrackedLink>
            </div>
          </div>

          <div className="border-t border-border/70 bg-muted/15 lg:border-t-0 lg:border-l">
            <div className="border-b border-border/70 px-5 py-3 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t.ledgerTitle}
            </div>
            <nav aria-label={t.ledgerTitle} className="divide-y divide-border/70">
              {FEATURED_AGENTX_MODELS.map((model) => (
                <CompareIndexTrackedLink
                  key={model.slug}
                  data-testid={`compare-agentx-model-${model.slug}`}
                  href={agentxDashboardHref(locale, model)}
                  analyticsEvent="compare_agentx_model_clicked"
                  analyticsTarget={model.slug}
                  analyticsSurface={surface}
                  className="group flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight text-foreground group-hover:text-brand">
                      {model.label}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] tracking-[0.14em] text-brand uppercase">
                      AgentX
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    {t.modelAction}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </span>
                </CompareIndexTrackedLink>
              ))}
            </nav>
          </div>
        </div>
      </Card>
    </section>
  );
}
