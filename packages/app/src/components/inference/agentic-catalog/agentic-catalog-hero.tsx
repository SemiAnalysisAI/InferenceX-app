import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { getTelemetryGuide } from '@/lib/agentx-telemetry-zh';
import type { Locale } from '@/lib/i18n';

import { AgenticCatalogLink } from './agentic-catalog-link';

/**
 * Short hero for `/inference/agentic`, drawn from the same
 * `AGENTX_TELEMETRY_GUIDE` that renders the full tutorial at
 * `/agentx/telemetry`. Reusing the guide's eyebrow, title, lead, and
 * highlights keeps the catalog's framing in lockstep with the tutorial —
 * including the highlight counts, which `agentx-telemetry.test.ts` pins to
 * what the detail page actually ships.
 */

const STRINGS = {
  en: {
    catalogLead:
      'Every card below opens the telemetry behind one AgentX configuration. Pick a model and a serving stack, and the detail page shows that run charted request by request.',
    readTutorial: 'Read the telemetry tutorial',
  },
  zh: {
    catalogLead:
      '下方每张卡片都会打开对应 AgentX 配置背后的遥测数据。选择一个模型与推理服务栈，详情页会逐请求呈现该次运行的图表。',
    readTutorial: '阅读遥测数据教程',
  },
} as const;

export function AgenticCatalogHero({ locale }: { locale: Locale }) {
  const guide = getTelemetryGuide(locale);
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  return (
    <section data-testid="agentic-catalog-hero">
      <Card>
        <Eyebrow as="p">{guide.eyebrow}</Eyebrow>
        <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
          {guide.title}
        </h1>
        <p className="mt-3 max-w-4xl text-base leading-7 text-muted-foreground lg:text-lg">
          {guide.lead}
        </p>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{t.catalogLead}</p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 lg:grid-cols-4">
          {guide.highlights.map((item) => (
            <div key={item.label} className="flex flex-col bg-card px-4 py-4">
              <dt className="order-2 mt-1 text-sm leading-5 text-muted-foreground">{item.label}</dt>
              <dd className="order-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <AgenticCatalogLink
            data-testid="agentic-catalog-tutorial-link"
            href={`${prefix}/agentx/telemetry`}
            analyticsEvent="agentic_catalog_tutorial_clicked"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
          >
            {t.readTutorial}
            <span aria-hidden="true">→</span>
          </AgenticCatalogLink>
        </div>
      </Card>
    </section>
  );
}
