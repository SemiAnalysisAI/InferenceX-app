import { LazyNudgeEngine } from '@/components/nudges/lazy-nudge-engine';

export default function ZhOverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LazyNudgeEngine scope="dashboard" />
      <main className="relative">
        <div className="container mx-auto flex flex-col gap-4 px-4 lg:px-8">{children}</div>
      </main>
    </>
  );
}
