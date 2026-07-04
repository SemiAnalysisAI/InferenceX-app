import { Card } from '@/components/ui/card';
import { TAB_INTRO_ZH, TAB_META_ZH, type ZhTabKey } from '@/lib/tab-meta-zh';

/**
 * Server-rendered Chinese intro above the interactive dashboard on /zh tab
 * pages. The charts below render in English; this block gives crawlers and
 * readers genuine Chinese content describing what the page shows.
 */
export function ZhTabIntro({ tab }: { tab: ZhTabKey }) {
  return (
    <Card data-testid="zh-tab-intro">
      <h1 className="text-xl lg:text-2xl font-bold tracking-tight">{TAB_META_ZH[tab].title}</h1>
      <p className="mt-2 text-sm lg:text-base text-muted-foreground">{TAB_INTRO_ZH[tab]}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        图表中的模型、GPU、框架与指标名称均沿用业界通用英文名称。
      </p>
    </Card>
  );
}
