import { NudgeEngine } from '@/components/nudge-engine';

/** Chinese sibling of `/overview` — see `app/overview/layout.tsx` for why this
 *  route skips DashboardShell. */
export default function ZhOverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NudgeEngine scope="dashboard" />
      <main className="relative">
        <div className="container mx-auto flex flex-col gap-4 px-4 lg:px-8">{children}</div>
      </main>
    </>
  );
}
