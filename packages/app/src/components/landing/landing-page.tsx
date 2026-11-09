import { ArrowRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AgentXCompareHero } from '@/components/compare/agentx-compare-hero';
import { IntroSection } from '@/components/landing/intro-section';
import { LandingPageAnalytics, LandingTrackedLink } from '@/components/landing/landing-analytics';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { NudgeEngine } from '@/components/nudges/nudge-engine';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { analyticsPlacement } from '@/lib/analytics/placement';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

const STRINGS = {
  en: {
    reproTitle: 'Every result comes from a public GitHub Actions run',
    reproP1:
      'Every data point on the dashboard is produced by a public GitHub Actions workflow run. The recipe lives in the repo, the run executes on the actual target hardware, and the full logs and artifacts are publicly viewable. Click any point on a chart to jump straight to the run that produced it. All reproducible, auditable, and open source.',
    reproStatPrefix: '',
    reproStatSuffix: '+ new benchmark datapoints added per week on average.',
    reproStatTail: 'Browse every new model, chip, framework, and configuration as it lands.',
    actionsRunsTitle: 'Public Actions runs',
    actionsRunsDesc:
      'Every benchmark executes on GitHub Actions with full logs visible while the run is in progress.',
    openRecipesTitle: 'Open recipes',
    openRecipesDesc:
      'Every model, framework, precision, and parallelism setting is committed to the public repo as a shell script.',
    browseSubmissions: 'Browse submissions',
    viewRuns: 'View benchmark runs on GitHub Actions',
    howItWorks: 'See how it works',
    quickComparisons: 'Quick comparisons',
    quickComparisonsDesc: 'Common chip inference comparisons, preset and ready to open.',
  },
  zh: {
    reproTitle: '所有结果均通过公开的 GitHub Actions 流程生成',
    reproP1:
      '仪表板上的每个数据点都来自一次公开的 GitHub Actions 运行。测试配置保存在仓库中，并在对应的真实硬件上执行；完整日志和产物均可公开查看。点击图表中的任意数据点，即可打开生成该结果的运行记录。整个过程可复现、可审计，并完全开源。',
    reproStatPrefix: '平均每周新增 ',
    reproStatSuffix: ' 多个基准测试数据点。',
    reproStatTail: '新模型、芯片、框架和配置上线后，都可以在这里查看。',
    actionsRunsTitle: '公开运行记录',
    actionsRunsDesc: '每次基准测试都通过 GitHub Actions 执行，运行期间即可查看完整日志。',
    openRecipesTitle: '公开测试配置',
    openRecipesDesc: '每个模型、框架、精度和并行配置都以 shell 脚本形式保存在公开仓库中。',
    browseSubmissions: '浏览提交记录',
    viewRuns: '查看 GitHub Actions 运行记录',
    howItWorks: '查看复现流程',
    quickComparisons: '快速对比',
    quickComparisonsDesc: '常用的芯片推理对比视图，已预设好，可直接打开。',
  },
} as const;

const SHOW_QUICK_COMPARISONS = false;

export function LandingPage({ locale = 'en' }: { locale?: Locale } = {}) {
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';
  const weeklyDatapoints = (1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
  return (
    <main className="relative">
      <LandingPageAnalytics />
      <NudgeEngine scope="landing" />
      <div className="container mx-auto flex flex-col gap-6 px-4 lg:px-8">
        <div className="contents" {...analyticsPlacement('landing_hero')}>
          <AgentXCompareHero locale={locale} headingLevel="h1" surface="landing" />
        </div>

        <IntroSection locale={locale} />

        <section className="flex flex-col gap-6" {...analyticsPlacement('landing_section')}>
          <Card className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-12">
            <div>
              <h2 className="text-lg font-semibold text-balance">{t.reproTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t.reproP1}</p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {t.reproStatPrefix}
                  {weeklyDatapoints}
                  {t.reproStatSuffix}
                </span>{' '}
                {t.reproStatTail}
              </p>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:grid-cols-1 lg:content-center lg:gap-6">
              <div>
                <dt className="text-sm font-medium text-foreground">{t.actionsRunsTitle}</dt>
                <dd className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t.actionsRunsDesc}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-foreground">{t.openRecipesTitle}</dt>
                <dd className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t.openRecipesDesc}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <LandingTrackedLink
                href={`${prefix}${getDashboardRoute('submissions').path}`}
                data-testid="landing-submissions-link"
                analyticsEvent="landing_submissions_clicked"
                appNavigation
                className={cn(buttonVariants({ variant: 'brand' }), 'group motion-press')}
              >
                {t.browseSubmissions}
                <ArrowRight className="size-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5" />
              </LandingTrackedLink>
              <LandingTrackedLink
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions?query=branch%3Amain+event%3Apush`}
                target="_blank"
                rel="noopener noreferrer"
                analyticsEvent="landing_reproducibility_actions_clicked"
                className={cn(buttonVariants({ variant: 'outline' }), 'motion-press')}
              >
                {t.viewRuns}
              </LandingTrackedLink>
              <LandingTrackedLink
                href={`${prefix}/about#reproducibility`}
                analyticsEvent="landing_reproducibility_about_clicked"
                className={cn(buttonVariants({ variant: 'outline' }), 'motion-press')}
              >
                {t.howItWorks}
              </LandingTrackedLink>
            </div>
          </Card>

          {SHOW_QUICK_COMPARISONS && (
            <Card data-testid="landing-quick-comparisons">
              <h2 className="text-lg font-semibold">{t.quickComparisons}</h2>
              <p className="mt-2 mb-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                {t.quickComparisonsDesc}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
