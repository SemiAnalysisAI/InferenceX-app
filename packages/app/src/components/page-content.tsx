'use client';

import { ChartTabs } from '@/components/chart-tabs';
import { ExportNudge } from '@/components/export-nudge';
import { GitHubStarModal } from '@/components/github-star-modal';
import { IntroSection } from '@/components/intro-section';
import { StarNudge } from '@/components/star-nudge';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

export function PageContent({ initialTab = 'inference' }: { initialTab?: string }) {
  return (
    <>
      <GitHubStarModal />
      <StarNudge />
      <ExportNudge />
      <UnofficialRunProvider>
        <main className="relative">
          <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
            <IntroSection />
            <ChartTabs initialTab={initialTab} />
          </div>
        </main>
      </UnofficialRunProvider>
    </>
  );
}
