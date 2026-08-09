import { NudgeEngine } from '@/components/nudge-engine';

/**
 * `/overview` sits outside DashboardShell: it has no TabNav, and it reads none
 * of the dashboard's shared state, so mounting GlobalFilterProvider and
 * UnofficialRunProvider only cost it two API requests it never used. The
 * container classes are copied from DashboardShell so the page is pixel-identical.
 */
export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NudgeEngine scope="dashboard" />
      <main className="relative">
        <div className="container mx-auto flex flex-col gap-4 px-4 lg:px-8">{children}</div>
      </main>
    </>
  );
}
