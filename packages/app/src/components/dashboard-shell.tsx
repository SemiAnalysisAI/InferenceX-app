'use client';

import { GlobalFilterProvider } from '@/components/GlobalFilterContext';
import { NudgeEngine } from '@/components/nudge-engine';
import { TabNav } from '@/components/tab-nav';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';
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
  const content = (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <TabNav />
        {children}
      </div>
    </main>
  );
  if (pathname === '/collectivex' || pathname === '/zh/collectivex') return content;
  return (
    <>
      {!isAgenticDetailPath(pathname) && <NudgeEngine scope="dashboard" />}
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
