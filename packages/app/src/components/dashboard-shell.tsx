'use client';

import { ExportNudge } from '@/components/export-nudge';
import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { GradientLabelNudge } from '@/components/gradient-label-nudge';
import { StarNudge } from '@/components/star-nudge';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StarNudge />
      <ExportNudge />
      <GradientLabelNudge />
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
