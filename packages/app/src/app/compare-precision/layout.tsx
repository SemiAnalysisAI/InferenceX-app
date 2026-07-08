import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

/**
 * Wraps `/compare-precision/*` pages in UnofficialRunProvider but skips
 * DashboardShell so we get a focused single-purpose page (no TabNav). Mirrors
 * the structure of `/compare-per-dollar/layout.tsx` — the GlobalFilterProvider
 * is mounted inside the page's client component so it can seed initial
 * precision/sequence based on which combos actually have data from the slug.
 */
export default function ComparePrecisionLayout({ children }: { children: React.ReactNode }) {
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
