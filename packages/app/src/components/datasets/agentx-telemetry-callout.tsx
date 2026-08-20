import { getTelemetryGuide } from '@/lib/agentx-telemetry-zh';
import type { Locale } from '@/lib/i18n';

import { AgentXTelemetryLink } from './agentx-telemetry-link';

const STRINGS = {
  en: {
    blurb:
      'Every point on an AgentX curve opens into the run behind it: eleven per-point telemetry charts, a per-request timeline, and a per-conversation flamegraph. The tutorial walks through all of them.',
  },
  zh: {
    blurb:
      'AgentX 曲线上的每个点都可以展开为其背后的完整运行数据：11 张单点遥测图表、按请求的时间线，以及单会话火焰图。本教程会逐一介绍。',
  },
} as const;

/**
 * Entry point from /agentx into the telemetry tutorial. Rendered inside the
 * AgentX methodology card next to the optimizations callout, so it is a
 * section rather than its own card.
 */
export function AgentXTelemetryCallout({ locale }: { locale: Locale }) {
  const guide = getTelemetryGuide(locale);
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <section
      aria-labelledby="agentx-telemetry-title"
      data-testid="agentx-telemetry-callout"
      className="rounded-lg border border-border bg-muted/20"
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <p className="mb-2 font-mono text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
          {guide.eyebrow}
        </p>
        <h2 id="agentx-telemetry-title" className="text-lg font-semibold text-foreground">
          {guide.title}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{t.blurb}</p>

        <AgentXTelemetryLink
          href={`${prefix}/agentx/telemetry`}
          analyticsEvent="agentx_telemetry_opened"
          analyticsTarget="agentx-callout"
          data-testid="agentx-telemetry-cta"
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          {guide.ui.readMore} →
        </AgentXTelemetryLink>
      </div>
    </section>
  );
}
