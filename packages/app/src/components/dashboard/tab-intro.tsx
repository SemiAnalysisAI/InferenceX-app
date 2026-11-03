import type { DashboardRouteKey } from '@/lib/routing/dashboard-routes';
import { TAB_HEADING, TAB_INTRO } from '@/lib/routing/tab-meta';

export function TabIntro({
  tab,
  title,
  intro,
}: {
  tab: DashboardRouteKey;
  title?: string;
  intro?: string;
}) {
  return (
    <header data-testid="tab-intro" className="py-2">
      <h1 className="text-xl font-semibold lg:text-2xl">{title ?? TAB_HEADING[tab]}</h1>
      <p className="mt-2 text-sm lg:text-base text-muted-foreground">{intro ?? TAB_INTRO[tab]}</p>
    </header>
  );
}
