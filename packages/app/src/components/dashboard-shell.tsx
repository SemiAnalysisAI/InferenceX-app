'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { NudgeEngine } from '@/components/nudge-engine';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
import { dashboardRouteForPathname } from '@/lib/dashboard-routes';
import { usePathname } from 'next/navigation';

/**
 * `/inference/agentic/[id]` (and its /zh sibling) mounts its own
 * `agentic-detail` NudgeEngine for the telemetry-tutorial card. Both engines
 * render into the same bottom-right corner, so leaving the dashboard engine
 * mounted there stacks two cards: `reproducibility` fires on a 1.5s timer with
 * no conditions, and `filter-hint` passes `isOnInferenceTab` because the route
 * still starts with `/inference`. Neither applies to the detail page anyway —
 * it has no filters, no export button, and no gradient labels.
 */
function isAgenticDetailPath(pathname: string): boolean {
  return /^\/(?:zh\/)?inference\/agentic\/[^/]+$/u.test(pathname);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const agenticDetail = isAgenticDetailPath(pathname);
  const providerCapabilities = agenticDetail
    ? { globalFilters: false, unofficialRuns: false }
    : (dashboardRouteForPathname(pathname)?.providers ?? {
        globalFilters: true,
        unofficialRuns: true,
      });

  let content = children;
  if (providerCapabilities.globalFilters) {
    content = <GlobalFilterProvider>{content}</GlobalFilterProvider>;
  }
  if (providerCapabilities.unofficialRuns) {
    content = <UnofficialRunProvider>{content}</UnofficialRunProvider>;
  }

  const mountsDashboardProviders =
    providerCapabilities.globalFilters || providerCapabilities.unofficialRuns;

  return (
    <>
      {mountsDashboardProviders && !agenticDetail && <NudgeEngine scope="dashboard" />}
      <main className="relative">
        <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
          <TabNav />
          {content}
        </div>
      </main>
    </>
  );
}
