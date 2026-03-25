'use client';

import { ExportNudge } from '@/components/export-nudge';
import { GitHubStarModal } from '@/components/github-star-modal';
import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { IntroSection } from '@/components/intro-section';
import { StarNudge } from '@/components/star-nudge';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GitHubStarModal />
      <StarNudge />
      <ExportNudge />
      <UnofficialRunProvider>
        <main className="relative">
          <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
            <IntroSection />
            <div className="w-full">
              <TabNav />
              <GlobalFilterProvider>{children}</GlobalFilterProvider>
            </div>
          </div>
        </main>
      </UnofficialRunProvider>
    </>
  );
}
