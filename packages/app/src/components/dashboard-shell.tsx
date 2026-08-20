'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { NudgeEngine } from '@/components/nudge-engine';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { dashboardShellCapabilitiesForPathname } from '@/lib/dashboard-routes';
import { usePathname } from 'next/navigation';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { providers: providerCapabilities, dashboardNudge } =
    dashboardShellCapabilitiesForPathname(pathname);

  let content = children;
  if (providerCapabilities.globalFilters) {
    content = <GlobalFilterProvider>{content}</GlobalFilterProvider>;
  }
  if (providerCapabilities.unofficialRuns) {
    content = <UnofficialRunProvider>{content}</UnofficialRunProvider>;
  }

  return (
    <>
      {dashboardNudge && <NudgeEngine scope="dashboard" />}
      <main className="relative">
        <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
          <TabNav />
          {content}
        </div>
      </main>
    </>
  );
}
