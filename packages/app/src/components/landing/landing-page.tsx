'use client';

import { ArrowRight, BarChart3, Sparkles } from 'lucide-react';
import { useEffect } from 'react';

import { Card } from '@/components/ui/card';
import { GitHubStarModal } from '@/components/github-star-modal';
import { IntroSection } from '@/components/intro-section';
import { CuratedViewCard } from '@/components/landing/curated-view-card';
import { FAVORITE_PRESETS } from '@/components/favorites/favorite-presets';
import { track } from '@/lib/analytics';

export function LandingPage() {
  useEffect(() => {
    track('landing_page_viewed');
  }, []);

  return (
    <main className="relative">
      <GitHubStarModal />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
        <IntroSection />

        {/* Split: Dashboard vs Presets */}
        <section className="flex flex-col gap-4 pb-8">
          {/* Left - Full Dashboard */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Full Dashboard</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Every model, GPU, framework, and metric. Fully configurable inference benchmark charts
              with date ranges, concurrency sweeps, and raw data export.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Compare NVIDIA GB200, B200, H200, AMD MI355X, MI325X, MI300X and more across DeepSeek,
              Llama, Qwen, and other models.
            </p>
            <div className="mt-auto">
              <a
                href="/inference"
                onClick={() => track('landing_full_dashboard_clicked')}
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm sm:text-base font-medium h-12 px-8 bg-brand text-primary-foreground hover:bg-brand/90 transition-colors"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </Card>

          {/* Right - Curated Presets */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold">Quick Comparisons</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Jump straight into the most popular GPU inference benchmark comparisons, curated and
              ready to explore.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FAVORITE_PRESETS.map((preset) => (
                <CuratedViewCard key={preset.id} preset={preset} />
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
