'use client';

import { GlobalFilterProvider } from '@/providers/GlobalFilterContext';
import { TabNav } from '@/components/dashboard/tab-nav';
import { UnofficialRunBanner, UnofficialRunProvider } from '@/providers/unofficial-run-provider';
import { dashboardShellCapabilitiesForPathname } from '@/lib/routing/dashboard-routes';
import { inferenceModelForPathname } from '@/lib/routing/inference-model-slug';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

// No dashboard nudge renders on first load. Each waits for a timer, a scroll or an app event, so
// the engine and its registry load after hydration. Nudges are optional, so a chunk that fails
// to load renders nothing rather than replacing the dashboard with the error page.
const NudgeEngine = dynamic(
  () =>
    import('@/components/nudges/nudge-engine').then(
      (module) => module.NudgeEngine,
      () => () => null,
    ),
  { ssr: false },
);

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
