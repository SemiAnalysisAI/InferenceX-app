import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { MinecraftSplash } from '@/components/minecraft/minecraft-splash';
import { agentxDashboardHref, FEATURED_AGENTX_MODELS } from '@/lib/compare-agentx';

import { CompareIndexTrackedLink } from './compare-index-tracked-link';

const STRINGS = {
  en: {
    eyebrow: 'AgentX / live results',
    title: 'Measuring real-world AI inference performance.',
    description:
      'Continuous, reproducible benchmarks of long-context, multi-turn agentic workloads across MI355X, GB300 NVL72, GB200 NVL72, B200, H200, H100, RTX Pro, and more.',
    overview: 'Overview',
    dashboard: 'Full dashboard',
    ledgerTitle: 'Models with AgentX results',
    ledgerEyebrow: 'AgentX',
    modelAction: 'View results',
  },
  zh: {
    eyebrow: 'AgentX｜最新结果',
    title: '衡量真实世界的 AI 推理性能。',
    description:
      '持续更新、可复现的基准测试，覆盖 MI355X、GB300 NVL72、GB200 NVL72、B200、H200、H100、RTX Pro 等平台上的长上下文、多轮智能体工作负载。',
    overview: '总览',
    dashboard: '查看完整仪表板',
    ledgerTitle: '已发布 AgentX 结果的模型',
    ledgerEyebrow: 'AgentX',
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
    <section data-testid="compare-agentx-primary" className="pt-10 pb-4 md:pt-16 md:pb-6">
      {/* Statement hero: oversized ink headline on the open page ground, no
          card chrome. The model ledger below trades the sidebar list for a
          row of bordered insight cards. */}
      <p className="font-mono text-xs font-semibold tracking-[0.18em] text-brand uppercase">
        {t.eyebrow}
      </p>
      <div className="relative">
        <Heading className="mt-4 max-w-4xl text-[2.1rem]/[1.12] font-semibold tracking-[-0.015em] text-foreground md:text-[3rem]/[1.1] lg:text-[3.4rem]/[1.08]">
          {t.title}
        </Heading>
        {surface === 'landing' && <MinecraftSplash />}
      </div>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
        {t.description}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <CompareIndexTrackedLink
          data-testid="compare-agentx-overview-link"
          href={`${prefix}/overview`}
          analyticsEvent="compare_agentx_overview_clicked"
          analyticsSurface={surface}
          appNavigation
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-mint px-7 py-3 font-semibold text-mint-foreground transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          appNavigation
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-card px-7 py-3 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t.dashboard}
          <ArrowRight aria-hidden="true" className="size-4" />
        </CompareIndexTrackedLink>
      </div>

      {/* Model ledger as insight cards */}
      <nav
        aria-label={t.ledgerTitle}
        className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 md:mt-12"
      >
        {FEATURED_AGENTX_MODELS.map((model) => (
          <CompareIndexTrackedLink
            key={model.slug}
            data-testid={`compare-agentx-model-${model.slug}`}
            href={agentxDashboardHref(locale, model)}
            analyticsEvent="compare_agentx_model_clicked"
            analyticsTarget={model.slug}
            analyticsSurface={surface}
            appNavigation
            className="group flex min-h-36 flex-col justify-between gap-6 rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] hover:border-brand/60 hover:shadow-[0_1px_10px_rgb(9_12_12_/_0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-brand uppercase">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
              {t.ledgerEyebrow}
            </span>
            <span className="block text-lg/6 font-semibold text-foreground">{model.label}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-brand">
              {t.modelAction}
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </span>
          </CompareIndexTrackedLink>
        ))}
      </nav>
    </section>
  );
}
