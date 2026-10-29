import { Card } from '@/components/ui/card';
import type { DashboardRouteKey } from '@/lib/routing/dashboard-routes';
import { TAB_INTRO, TAB_META } from '@/lib/routing/tab-meta';

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
    <Card data-testid="tab-intro">
      <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
        {title ?? TAB_META[tab].title}
      </h1>
      <p className="mt-2 text-sm lg:text-base text-muted-foreground">{intro ?? TAB_INTRO[tab]}</p>
    </Card>
  );
}
