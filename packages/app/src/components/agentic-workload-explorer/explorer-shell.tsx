'use client';

import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { SectionNav } from '@/components/agentic-workload-explorer/section-nav';
import { SnapshotStamp } from '@/components/agentic-workload-explorer/snapshot-stamp';
import { TraceVersionSelector } from '@/components/agentic-workload-explorer/trace-version-selector';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { explorerRelativePath } from '@/lib/agentic-workload-explorer/paths';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    title: 'Agentic Workload Explorer',
    description:
      'Anonymized coding-agent traces captured by ProxyTrace: sessions, token flow, cache reuse, latency and tool use.',
  },
  zh: {
    title: 'Agentic Workload Explorer',
    description:
      '基于 ProxyTrace 采集的匿名 coding agent trace：会话、token 流向、cache 复用、延迟与工具调用。',
  },
};

export function ExplorerShell({ children }: { children: ReactNode }) {
  const strings = STRINGS[useLocale()];
  // The overview page's TabIntro carries its h1; every section page uses this title as its h1.
  const isOverview = explorerRelativePath(usePathname() ?? '') === '/';
  const isMobile = useIsMobileViewport();
  const actions = (
    <>
      <Suspense fallback={null}>
        <TraceVersionSelector />
      </Suspense>
      <ChartShareActions />
    </>
  );
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="agentic-workload-explorer">
      <Card className="gap-4">
        <div className="flex flex-col gap-2">
          <DashboardSectionHeader
            title={strings.title}
            headingAs={isOverview ? 'h2' : 'h1'}
            description={strings.description}
            actions={isMobile ? undefined : actions}
          />
          <SnapshotStamp />
          {isMobile && <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>}
        </div>
        <SectionNav />
      </Card>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
