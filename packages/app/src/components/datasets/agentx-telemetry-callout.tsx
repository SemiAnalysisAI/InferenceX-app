import { ArrowRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { getTelemetryGuide } from '@/lib/agentx/agentx-telemetry-zh';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

import { AgentXTelemetryLink } from './agentx-telemetry-link';

const STRINGS = {
  en: {
    blurb:
      'Every point on an AgentX curve opens into the run behind it: eleven per-point telemetry charts, a per-request timeline, and a per-conversation flamegraph. The tutorial walks through all of them.',
  },
  zh: {
    blurb:
      '点击 AgentX 曲线上的任一数据点，都可查看该次运行的详细数据，包括 11 张单点遥测图、逐请求时间线和单会话火焰图。本教程将逐一介绍这些视图。',
  },
} as const;

export function AgentXTelemetryCallout({ locale }: { locale: Locale }) {
  const guide = getTelemetryGuide(locale);
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <section aria-labelledby="agentx-telemetry-title" data-testid="agentx-telemetry-callout">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{guide.eyebrow}</p>
        <h2 id="agentx-telemetry-title" className="text-lg font-semibold text-foreground">
          {guide.title}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{t.blurb}</p>

        <AgentXTelemetryLink
          href={`${prefix}/agentx/telemetry`}
          analyticsEvent="agentx_telemetry_opened"
          analyticsTarget="agentx-callout"
          data-testid="agentx-telemetry-cta"
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
        >
          {guide.ui.readMore}
          <ArrowRight aria-hidden="true" />
        </AgentXTelemetryLink>
      </div>
    </section>
  );
}
