import type { ReactNode } from 'react';

import { analyticsPlacement } from '@/lib/analytics/placement';
import { LazyUnofficialRunProvider } from '@/providers/lazy-unofficial-run-provider';

interface ComparePageLayoutProps {
  children: ReactNode;
}

export function ComparePageLayout({ children }: ComparePageLayoutProps) {
  return (
    <LazyUnofficialRunProvider>
      <main className="relative" {...analyticsPlacement('compare')}>
        <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4 pb-8">
          {children}
        </div>
      </main>
    </LazyUnofficialRunProvider>
  );
}
