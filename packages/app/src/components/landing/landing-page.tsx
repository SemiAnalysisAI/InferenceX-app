import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { AgentXCompareHero } from '@/components/compare/agentx-compare-hero';
import { IntroSection } from '@/components/intro-section';
import { LandingPageAnalytics, LandingTrackedLink } from '@/components/landing/landing-analytics';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { NudgeEngine } from '@/components/nudge-engine';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: {
    exploreInferenceX: 'Explore InferenceX',
    exploreInferenceXLead:
      'Start with a concise cost overview across active models and key platforms, or open the full dashboard for every model, chip, framework, and metric. AgentX is our long-context, multi-turn coding scenario.',
    fullDashboard: 'Full Dashboard',
    platformCoverage:
      'Compare NVIDIA GB300 NVL72, GB200 NVL72, B300, B200, H200, H100, AMD MI355X, MI325X, MI300X and soon VR200 NVL72, AMD MI455X UALoE72, TPUv7 Ironwood, etc across DeepSeekv4 Pro, Qwen, Kimi, GLM, MiniMax, gpt-oss, Llama and other models.',
    overview: 'Overview',
    reproTitle: 'Every Result Is Transparently done through Public GitHub Actions Automation',
    reproP1:
      'Every data point on the dashboard is produced by a public GitHub Actions workflow run. The recipe lives in the repo, the run executes on the actual target hardware, and the full logs and artifacts are publicly viewable. Click any point on a chart to jump straight to the run that produced it. All reproducible, auditable, and open source.',
    reproStat: '1,000+ new benchmark datapoints added per week on average.',
    reproStatTail: 'Browse every new model, chip, framework, and configuration as it lands.',
    actionsRunsTitle: 'Public Actions runs',
    actionsRunsDesc:
      'Every benchmark executes on GitHub Actions with full logs visible while the run is in progress.',
    openRecipesTitle: 'Open recipes',
    openRecipesDesc:
      'Every model, framework, precision, and parallelism setting is committed to the public repo as a shell script.',
    dbSnapshotsTitle: 'Weekly DB snapshots',
    dbSnapshotsDesc:
      'The full benchmark database is published as a public GitHub Release every week so the historical dataset stays auditable.',
    browseSubmissions: 'Browse submissions',
    viewRuns: 'View benchmark runs on GitHub Actions',
    howItWorks: 'How it works',
    quickComparisons: 'Quick Comparisons',
    quickComparisonsDesc:
      'Jump straight into the most popular chip inference benchmark comparisons, curated and ready to explore.',
  },
  zh: {
    exploreInferenceX: '探索 InferenceX',
    exploreInferenceXLead:
      '先从成本总览了解当前活跃的模型和主要硬件平台，也可以进入仪表板，按模型、芯片、框架和指标深入比较。AgentX 用于评测长上下文、多轮编码的工作负载。',
    fullDashboard: '查看完整仪表板',
    platformCoverage:
      '目前覆盖 DeepSeekv4 Pro、Qwen、Kimi、GLM、MiniMax、gpt-oss、Llama 等模型，以及 NVIDIA GB300 NVL72、GB200 NVL72、B300、B200、H200、H100 和 AMD MI355X、MI325X、MI300X 等硬件。后续还将加入 VR200 NVL72、AMD MI455X UALoE72 和 TPUv7 Ironwood。',
    overview: '总览',
    reproTitle: '所有结果均通过公开的 GitHub Actions 流程生成',
    reproP1:
      '仪表板上的每个数据点都来自一次公开的 GitHub Actions 运行。测试配置保存在仓库中，并在对应的真实硬件上执行；完整日志和产物均可公开查看。点击图表中的任意数据点，即可打开生成该结果的运行记录。整个过程可复现、可审计，并完全开源。',
    reproStat: '平均每周新增 1,000 多个基准测试数据点。',
    reproStatTail: '新模型、芯片、框架和配置上线后，都可以在这里查看。',
    actionsRunsTitle: '公开运行记录',
    actionsRunsDesc: '每次基准测试都通过 GitHub Actions 执行，运行期间即可查看完整日志。',
    openRecipesTitle: '公开测试配置',
    openRecipesDesc: '每个模型、框架、精度和并行配置都以 shell 脚本形式保存在公开仓库中。',
    dbSnapshotsTitle: '每周数据库快照',
    dbSnapshotsDesc:
      '完整的基准测试数据库每周都会作为公开的 GitHub Release 发布，方便任何人核查历史数据。',
    browseSubmissions: '浏览提交记录',
    viewRuns: '查看 GitHub Actions 运行记录',
    howItWorks: '了解复现流程',
    quickComparisons: '快速对比',
    quickComparisonsDesc: '一键进入最热门的 Chip 推理基准测试对比，精选视图开箱即用。',
  },
} as const;

/**
 * Quick Comparisons is hidden for now. The card, its `quickComparisons*`
 * strings, `CuratedViewCard`, and `FAVORITE_PRESETS` are all left in place —
 * flip this to `true` to bring the section back.
 */
const SHOW_QUICK_COMPARISONS = false;

export function LandingPage({ locale = 'en' }: { locale?: Locale } = {}) {
  const t = STRINGS[locale];
  // Internal links stay within the current language tree.
  const prefix = locale === 'zh' ? '/zh' : '';
  return (
    <main className="relative">
      <LandingPageAnalytics />
      <NudgeEngine scope="landing" />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
        {/* Same AgentX hero that leads /compare, above the quote carousel. The
            landing page owns no h1 of its own, but keep this an h2 so the hero
            stays a section within the page rather than retitling the whole
            site. */}
        <AgentXCompareHero locale={locale} headingLevel="h2" surface="landing" />

        <IntroSection locale={locale} />

        {/* Split: exploration entry points vs presets */}
        <section className="flex flex-col gap-4 pb-8">
          {/* Primary product entry points */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="size-5 shrink-0 text-brand" />
              <h2 className="text-lg font-semibold">{t.exploreInferenceX}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{t.exploreInferenceXLead}</p>
            <p className="text-sm text-muted-foreground mb-6">{t.platformCoverage}</p>
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <LandingTrackedLink
                href={`${prefix}/overview`}
                data-testid="landing-overview-link"
                analyticsEvent="landing_overview_clicked"
                appNavigation
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-auto sm:text-base"
              >
                {t.overview}
                <ArrowRight aria-hidden="true" className="size-4" />
              </LandingTrackedLink>
              <LandingTrackedLink
                href={`${prefix}/inference`}
                data-testid="landing-full-dashboard-link"
                analyticsEvent="landing_full_dashboard_clicked"
                appNavigation
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border px-8 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-auto sm:text-base"
              >
                {t.fullDashboard}
                <ArrowRight aria-hidden="true" className="size-4" />
              </LandingTrackedLink>
            </div>
          </Card>

          {/* Reproducibility callout */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="size-5 shrink-0 text-brand" />
              <h2 className="text-lg font-semibold">{t.reproTitle}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t.reproP1}</p>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-semibold text-foreground">{t.reproStat}</span> {t.reproStatTail}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-semibold text-foreground">{t.actionsRunsTitle}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.actionsRunsDesc}</div>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-semibold text-foreground">{t.openRecipesTitle}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.openRecipesDesc}</div>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-semibold text-foreground">{t.dbSnapshotsTitle}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.dbSnapshotsDesc}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <LandingTrackedLink
                href={`${prefix}/submissions`}
                data-testid="landing-submissions-link"
                analyticsEvent="landing_submissions_clicked"
                appNavigation
                className="inline-flex items-center gap-1.5 rounded-md bg-brand text-primary-foreground hover:bg-brand/90 px-3 py-1.5 transition-colors font-medium"
              >
                {t.browseSubmissions}
                <ArrowRight className="size-3.5" />
              </LandingTrackedLink>
              <LandingTrackedLink
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions?query=branch%3Amain+event%3Apush`}
                target="_blank"
                rel="noopener noreferrer"
                analyticsEvent="landing_reproducibility_actions_clicked"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                {t.viewRuns}
                <ArrowRight className="size-3.5" />
              </LandingTrackedLink>
              <LandingTrackedLink
                href={`${prefix}/about#reproducibility`}
                analyticsEvent="landing_reproducibility_about_clicked"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                {t.howItWorks}
              </LandingTrackedLink>
            </div>
          </Card>

          {/* Right - Curated Presets (temporarily hidden, see SHOW_QUICK_COMPARISONS) */}
          {SHOW_QUICK_COMPARISONS && (
            <Card data-testid="landing-quick-comparisons">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-5 shrink-0 text-brand" />
                <h2 className="text-lg font-semibold">{t.quickComparisons}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t.quickComparisonsDesc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FAVORITE_PRESETS.filter((preset) => !preset.hidden).map((preset) => (
                  <CuratedViewCard key={preset.id} preset={preset} />
                ))}
              </div>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
