import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MinecraftSplash } from '@/components/minecraft/minecraft-splash';
import { NewBadge } from '@/components/ui/new-badge';
import { agentxDashboardHref, FEATURED_AGENTX_MODELS } from '@/lib/compare-agentx';

import { CompareIndexTrackedLink } from './compare-index-tracked-link';

/**
 * Full-color brand marks for the ledger rows, sharing the `*-color.svg`
 * assets used by `/model` pages and inference chart captions. Keyed by
 * compare slug so a featured model without a registered mark simply renders
 * without one instead of breaking the row.
 */
const MODEL_LOGOS: Record<string, string> = {
  'kimi-k3': '/logos/kimi-color.svg',
  'deepseek-v4': '/logos/deepseek-color.svg',
  // GLM ships under the Z.ai product brand, so the ledger shows the Z.ai
  // mark rather than the Zhipu corporate dot cluster.
  'glm-5-2': '/logos/zai-color.svg',
  'minimax-m3': '/logos/minimax-color.svg',
  'qwen-3-8-flash-next': '/logos/qwen-color.svg',
  'qwen-3-5': '/logos/qwen-color.svg',
};

const STRINGS = {
  en: {
    eyebrow: 'AgentX / live results',
    title: 'Compare Realistic Agentic Inference Perf',
    description:
      'Long Context Multi Turn Inference Performance. Compare Across OpenAI Jalapeño, MI355X, GB300 NVL72, GB200 NVL72, B200, H200, H100, RTX Pro, and soon TPUv7/v8 & Rubin NVL72 & MI455X UALoE72',
    overview: 'Overview',
    dashboard: 'Full dashboard',
    ledgerTitle: 'Models with AgentX results',
    modelAction: 'View results',
    newModel: 'NEW',
  },
  zh: {
    eyebrow: 'AgentX｜最新结果',
    title: '真实智能体工作负载下的推理性能对比',
    description:
      '比较不同硬件平台在长上下文、多轮智能体工作负载下的推理性能，覆盖 OpenAI Jalapeño、MI355X、GB300 NVL72、GB200 NVL72、B200、H200、H100 和 RTX Pro，即将支持 TPUv7/v8、Rubin NVL72 与 MI455X UALoE72。',
    overview: '总览',
    dashboard: '查看完整仪表板',
    ledgerTitle: '已发布 AgentX 结果的模型',
    modelAction: '查看结果',
    newModel: '新',
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
          <div className="flex flex-col justify-center px-6 py-5 md:px-8 md:py-6 lg:px-10 lg:py-7">
            <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
              {t.eyebrow}
            </p>
            {/* `relative` anchors the splash, which positions itself absolutely
                at the top right. Landing only: /compare is not the launch
                surface, and the announcement belongs on the front page. */}
            <div className="relative">
              <Heading className="mt-3 max-w-2xl text-2xl/[1.8rem] font-semibold tracking-tight text-foreground lg:text-[2.4rem]/[2.4rem]">
                {t.title}
              </Heading>
              {surface === 'landing' && <MinecraftSplash />}
            </div>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground lg:text-lg">
              {t.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <CompareIndexTrackedLink
                data-testid="compare-agentx-overview-link"
                href={`${prefix}/overview`}
                analyticsEvent="compare_agentx_overview_clicked"
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
              >
                {t.overview}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </CompareIndexTrackedLink>
              <CompareIndexTrackedLink
                data-testid="compare-agentx-dashboard-link"
                href={agentxDashboardHref(locale, FEATURED_AGENTX_MODELS[0])}
                analyticsEvent="compare_agentx_dashboard_clicked"
                analyticsTarget="kimi-k3"
                analyticsSurface={surface}
                appNavigation
                className="group motion-press inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {t.dashboard}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                />
              </CompareIndexTrackedLink>
            </div>
          </div>

          <div className="border-t border-border/70 bg-muted/15 lg:border-t-0 lg:border-l">
            {/* The visible ledger header is dropped; `ledgerTitle` stays as the
                nav's accessible name so screen readers still get the label. */}
            <nav aria-label={t.ledgerTitle} className="divide-y divide-border/70">
              {FEATURED_AGENTX_MODELS.map((model) => (
                <CompareIndexTrackedLink
                  key={model.slug}
                  data-testid={`compare-agentx-model-${model.slug}`}
                  href={agentxDashboardHref(locale, model)}
                  analyticsEvent="compare_agentx_model_clicked"
                  analyticsTarget={model.slug}
                  analyticsSurface={surface}
                  appNavigation
                  className="group flex min-h-14 items-center justify-between gap-4 px-5 py-2.5 transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {MODEL_LOGOS[model.slug] && (
                      <img
                        src={MODEL_LOGOS[model.slug]}
                        alt=""
                        aria-hidden="true"
                        width={32}
                        height={32}
                        loading="lazy"
                        className="size-8 shrink-0 object-contain"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-foreground group-hover:text-brand">
                        <span className="min-w-0">{model.label}</span>
                        <NewBadge data-new-badge="agentx-ledger">{t.newModel}</NewBadge>
                      </span>
                      <span className="mt-1 block font-mono text-3xs tracking-eyebrow text-brand uppercase">
                        AgentX
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    {t.modelAction}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3.5 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
                    />
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
