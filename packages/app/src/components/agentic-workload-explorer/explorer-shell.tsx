'use client';

import { Suspense, type ReactNode } from 'react';

import { SectionNav } from '@/components/agentic-workload-explorer/section-nav';
import { SnapshotStamp } from '@/components/agentic-workload-explorer/snapshot-stamp';
import { TraceVersionSelector } from '@/components/agentic-workload-explorer/trace-version-selector';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';

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

/**
 * Chrome shared by every explorer page, rendered inside the dashboard shell
 * (below the InferenceX tab nav): title, snapshot stamp, the global
 * trace-version filter and the explorer's own section navigation.
 */
export function ExplorerShell({ children }: { children: ReactNode }) {
  const strings = STRINGS[useLocale()];
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="agentic-workload-explorer">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Heading as="h2" level="section" className="mb-1">
            {strings.title}
          </Heading>
          <p className="text-sm text-muted-foreground">{strings.description}</p>
          <div className="mt-2">
            <SnapshotStamp />
          </div>
        </div>
        {/* `useSearchParams` in the selector needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <TraceVersionSelector />
        </Suspense>
      </div>
      <SectionNav />
      <div className="min-w-0">{children}</div>
    </section>
  );
}
