import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { IntroSection } from '@/components/intro-section';
import { LandingPageAnalytics, LandingTrackedLink } from '@/components/landing/landing-analytics';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { NudgeEngine } from '@/components/nudge-engine';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: {
    fullDashboard: 'Full Dashboard',
    fullDashboardP1:
      'Every model, GPU, framework, and metric. Fully configurable inference benchmark charts with date ranges, concurrency sweeps, and raw data export.',
    fullDashboardP2:
      'Compare NVIDIA GB300 NVL72, GB200 NVL72, B300, B200, H200, H100, AMD MI355X, MI325X, MI300X and soon VR200 NVL72, AMD MI455X UALoE72, TPUv7 Ironwood, etc across DeepSeekv4 Pro, Qwen, Kimi, GLM, MiniMax, gpt-oss, Llama and other models.',
    openDashboard: 'Open Dashboard',
    reproTitle: 'Every Result Is Transparently done through Public GitHub Actions Automation',
    reproP1:
      'Every data point on the dashboard is produced by a public GitHub Actions workflow run. The recipe lives in the repo, the run executes on the actual target hardware, and the full logs and artifacts are publicly viewable. Click any point on a chart to jump straight to the run that produced it. All reproducible, auditable, and open source.',
    reproStat: '1,000+ new benchmark datapoints added per week on average.',
    reproStatTail: 'Browse every new model, GPU, framework, and configuration as it lands.',
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
      'Jump straight into the most popular GPU inference benchmark comparisons, curated and ready to explore.',
  },
  zh: {
    fullDashboard: '完整仪表板',
    fullDashboardP1:
      '覆盖所有模型、GPU、框架与指标。完全可配置的推理基准测试图表，支持日期范围、并发扫描与原始数据导出。',
    fullDashboardP2:
      '跨 DeepSeekv4 Pro、Qwen、Kimi、GLM、MiniMax、gpt-oss、Llama 等模型，对比 NVIDIA GB300 NVL72、GB200 NVL72、B300、B200、H200、H100、AMD MI355X、MI325X、MI300X，以及即将上线的 VR200 NVL72、AMD MI455X UALoE72、TPUv7 Ironwood 等硬件。',
    openDashboard: '打开仪表板',
    reproTitle: '每一条结果都通过公开的 GitHub Actions 自动化流程透明产生',
    reproP1:
      '仪表板上的每个数据点都由公开的 GitHub Actions 工作流运行产生。配置方案（recipe）保存在公开仓库中，运行在真实目标硬件上执行，完整日志与产物公开可查。点击图表上的任意数据点即可跳转到生成它的那次运行。一切都可复现、可审计、开源。',
    reproStat: '平均每周新增 1,000+ 条基准测试数据点。',
    reproStatTail: '第一时间浏览每个新上线的模型、GPU、框架与配置。',
    actionsRunsTitle: '公开的 Actions 运行',
    actionsRunsDesc: '每次基准测试都在 GitHub Actions 上执行，运行过程中即可实时查看完整日志。',
    openRecipesTitle: '开放的配置方案',
    openRecipesDesc: '每个模型、框架、精度与并行配置都以 shell 脚本形式提交在公开仓库中。',
    dbSnapshotsTitle: '每周数据库快照',
    dbSnapshotsDesc:
      '完整基准测试数据库每周以公开 GitHub Release 的形式发布，历史数据集持续可审计。',
    browseSubmissions: '浏览提交记录',
    viewRuns: '在 GitHub Actions 上查看基准测试运行',
    howItWorks: '工作原理',
    quickComparisons: '快速对比',
    quickComparisonsDesc: '一键进入最热门的 GPU 推理基准测试对比，精选视图开箱即用。',
  },
} as const;

export function LandingPage({ locale = 'en' }: { locale?: Locale } = {}) {
  const t = STRINGS[locale];
  // Internal links stay within the current language tree.
  const prefix = locale === 'zh' ? '/zh' : '';
  return (
    <main className="relative">
      <LandingPageAnalytics />
      <NudgeEngine scope="landing" />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
        <IntroSection locale={locale} />

        {/* Split: Dashboard vs Presets */}
        <section className="flex flex-col gap-4 pb-8">
          {/* Left - Full Dashboard */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="size-5 shrink-0 text-brand" />
              <h2 className="text-lg font-semibold">{t.fullDashboard}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{t.fullDashboardP1}</p>
            <p className="text-sm text-muted-foreground mb-6">{t.fullDashboardP2}</p>
            <div className="mt-auto">
              <LandingTrackedLink
                href={`${prefix}/inference`}
                analyticsEvent="landing_full_dashboard_clicked"
                appNavigation
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm sm:text-base font-medium h-12 px-8 bg-brand text-primary-foreground hover:bg-brand/90 transition-colors"
              >
                {t.openDashboard}
                <ArrowRight className="size-4" />
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

          {/* Right - Curated Presets */}
          <Card>
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
        </section>
      </div>
    </main>
  );
}
