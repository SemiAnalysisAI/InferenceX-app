import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

/**
 * Chinese (`/zh/compare-per-dollar/*`) layout — mirrors
 * `/compare-per-dollar/layout.tsx`.
 */
export default function ComparePerDollarZhLayout({ children }: { children: React.ReactNode }) {
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
