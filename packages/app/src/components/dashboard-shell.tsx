'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { NudgeEngine } from '@/components/nudge-engine';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NudgeEngine scope="dashboard" />
      <UnofficialRunProvider>
        <main className="relative">
          <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
            <TabNav />
            <GlobalFilterProvider>{children}</GlobalFilterProvider>
          </div>
        </main>
      </UnofficialRunProvider>
    </>
  );
}
