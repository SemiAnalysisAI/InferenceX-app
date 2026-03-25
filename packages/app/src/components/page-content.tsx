'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { ChartTabs } from '@/components/chart-tabs';
import { ExportNudge } from '@/components/export-nudge';
import { GitHubStarModal } from '@/components/github-star-modal';
import { StarNudge } from '@/components/star-nudge';
import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

export function PageContent({ initialTab = 'inference' }: { initialTab?: string }) {
  return (
    <>
      <GitHubStarModal />
      <StarNudge />
      <ExportNudge />
      <UnofficialRunProvider>
        <main className="relative">
          <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
              <ChevronLeft className="h-3 w-3" />
              InferenceX Home
            </Link>
            <ChartTabs initialTab={initialTab} />
          </div>
        </main>
      </UnofficialRunProvider>
    </>
  );
}
