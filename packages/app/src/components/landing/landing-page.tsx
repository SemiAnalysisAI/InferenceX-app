'use client';

import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Card } from '@/components/ui/card';
import { Dsv4LaunchModal } from '@/components/dsv4-launch-modal';
import { GitHubStarModal } from '@/components/github-star-modal';
import { IntroSection } from '@/components/intro-section';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { LaunchBanner } from '@/components/landing/launch-banner';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { track } from '@/lib/analytics';
import { navigateInApp } from '@/lib/client-navigation';
import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

export function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    track('landing_page_viewed');
  }, []);

  return (
    <main className="relative">
      <Dsv4LaunchModal />
      <GitHubStarModal />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
        <LaunchBanner />
        <IntroSection />

        {/* Split: Dashboard vs Presets */}
        <section className="flex flex-col gap-4 pb-8">
          {/* Left - Full Dashboard */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="size-5 shrink-0 text-brand" />
              <h2 className="text-lg font-semibold">Full Dashboard</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Every model, GPU, framework, and metric. Fully configurable inference benchmark charts
              with date ranges, concurrency sweeps, and raw data export.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Compare NVIDIA B200, H200, H100, AMD MI355X, MI325X, MI300X and more across DeepSeek,
              gpt-oss, Llama, Qwen, and other models.
            </p>
            <div className="mt-auto">
              <Link
                href="/inference"
                onClick={(e) => {
                  track('landing_full_dashboard_clicked');
                  navigateInApp(e, router, '/inference');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm sm:text-base font-medium h-12 px-8 bg-brand text-primary-foreground hover:bg-brand/90 transition-colors"
              >
                Open Dashboard
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>

          {/* Reproducibility callout */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="size-5 shrink-0 text-brand" />
              <h2 className="text-lg font-semibold">Every Result Is Reproducible</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Every data point on the dashboard is produced by a public GitHub Actions workflow run.
              The recipe lives in the repo, the run executes on the actual target hardware, and the
              full logs and artifacts are publicly viewable. Click any point on a chart to jump
              straight to the run that produced it. All reproducible, auditable, and open source.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-semibold text-foreground">Public Actions runs</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Every benchmark executes on GitHub Actions with full logs visible while the run is
                  in progress.
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-semibold text-foreground">Open recipes</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Every model, framework, precision, and parallelism setting is committed to the
                  public repo as a shell script.
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-semibold text-foreground">Weekly DB snapshots</div>
                <div className="text-xs text-muted-foreground mt-1">
                  The full benchmark database is published as a public GitHub Release every week so
                  the historical dataset stays auditable.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <a
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions?query=branch%3Amain+event%3Apush`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('landing_reproducibility_actions_clicked')}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand text-primary-foreground hover:bg-brand/90 px-3 py-1.5 transition-colors font-medium"
              >
                View benchmark runs on GitHub Actions
                <ArrowRight className="size-3.5" />
              </a>
              <Link
                href="/about#reproducibility"
                onClick={() => track('landing_reproducibility_about_clicked')}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                How it works
              </Link>
            </div>
          </Card>

          {/* Right - Curated Presets */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="size-5 shrink-0 text-brand" />
              <h2 className="text-lg font-semibold">Quick Comparisons</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Jump straight into the most popular GPU inference benchmark comparisons, curated and
              ready to explore.
            </p>
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
