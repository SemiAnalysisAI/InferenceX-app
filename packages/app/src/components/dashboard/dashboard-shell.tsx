'use client';

import { GlobalFilterProvider } from '@/providers/GlobalFilterContext';
import { NudgeEngine } from '@/components/nudges/nudge-engine';
import { TabNav } from '@/components/dashboard/tab-nav';
import { UnofficialRunBanner, UnofficialRunProvider } from '@/providers/unofficial-run-provider';
import { dashboardShellCapabilitiesForPathname } from '@/lib/routing/dashboard-routes';
import { inferenceModelForPathname } from '@/lib/routing/inference-model-slug';
import { usePathname } from 'next/navigation';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    providers: providerCapabilities,
    dashboardNudge,
    tabNav,
  } = dashboardShellCapabilitiesForPathname(pathname);

  let content = children;
  if (providerCapabilities.globalFilters) {
    content = (
      <GlobalFilterProvider initialModel={inferenceModelForPathname(pathname) ?? undefined}>
        {content}
      </GlobalFilterProvider>
    );
  }
  if (tabNav) {
    content = (
      <>
        <TabNav
          footer={
            providerCapabilities.unofficialRuns ? <UnofficialRunBanner attached /> : undefined
          }
        />
        {content}
      </>
    );
  }
  if (providerCapabilities.unofficialRuns) {
    content = <UnofficialRunProvider showBanner={false}>{content}</UnofficialRunProvider>;
  }

  return (
    <>
      {dashboardNudge && <NudgeEngine scope="dashboard" />}
      <main className="relative">
        <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">{content}</div>
      </main>
    </>
  );
}
