import type { DashboardRouteKey } from '@/lib/routing/dashboard-routes';
import { TAB_INTRO_ZH, TAB_META_ZH } from '@/lib/routing/tab-meta-zh';

export function ZhTabIntro({
  tab,
  title,
  intro,
}: {
  tab: DashboardRouteKey;
  title?: string;
  intro?: string;
}) {
  return (
    <header data-testid="zh-tab-intro" className="py-2">
      <h1 className="text-xl font-semibold lg:text-2xl">{title ?? TAB_META_ZH[tab].title}</h1>
      <p className="mt-2 text-sm lg:text-base text-muted-foreground">
        {intro ?? TAB_INTRO_ZH[tab]}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        图表中的模型、芯片、框架与指标名称均沿用业界通用英文名称。
      </p>
    </header>
  );
}
