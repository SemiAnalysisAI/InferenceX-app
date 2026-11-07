import { Heading } from '@/components/ui/heading';
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
      <Heading as="h1" level="card">
        {title ?? TAB_HEADING[tab]}
      </Heading>
      <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{intro ?? TAB_INTRO[tab]}</p>
    </header>
  );
}
