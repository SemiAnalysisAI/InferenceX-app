import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

/**
 * Wraps `/compare/*` pages in UnofficialRunProvider but skips DashboardShell so
 * we get a focused single-purpose page (no TabNav). The GlobalFilterProvider is
 * mounted inside the page's client component instead — that lets the page seed
 * its initial precision/sequence based on which combos actually have data for
 * the GPU pair from the slug.
 */
export default function CompareLayout({ children }: { children: React.ReactNode }) {
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
