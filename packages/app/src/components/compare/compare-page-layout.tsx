import type { ReactNode } from 'react';

import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

interface ComparePageLayoutProps {
  children: ReactNode;
}

/** Focused compare-page shell without the dashboard route navigation. */
export function ComparePageLayout({ children }: ComparePageLayoutProps) {
  return (
    <UnofficialRunProvider>
      <main className="relative">
        <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4 pb-8">
          {children}
        </div>
      </main>
    </UnofficialRunProvider>
  );
}
