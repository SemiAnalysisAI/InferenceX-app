'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { NudgeEngine } from '@/components/nudge-engine';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunBanner, UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { dashboardShellCapabilitiesForPathname } from '@/lib/dashboard-routes';
import { inferenceModelForPathname } from '@/lib/inference-model-slug';
import { usePathname } from 'next/navigation';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { providers: providerCapabilities, dashboardNudge } =
    dashboardShellCapabilitiesForPathname(pathname);

  let content = children;
  if (providerCapabilities.globalFilters) {
    // `/inference/<model>` pages pin the model from the path. Seeding the
    // provider (rather than only applying it in an effect) keeps the server
    // render and first client paint on the right model — `usePathname` is
    // available during SSR, so hydration agrees. Soft navigations between
    // model pages don't remount this provider; those are handled by the
    // pathname-keyed effect inside GlobalFilterProvider.
    content = (
      <GlobalFilterProvider initialModel={inferenceModelForPathname(pathname) ?? undefined}>
        {content}
      </GlobalFilterProvider>
    );
  }
  content = (
    <>
      <TabNav
        footer={providerCapabilities.unofficialRuns ? <UnofficialRunBanner attached /> : undefined}
      />
      {content}
    </>
  );
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
