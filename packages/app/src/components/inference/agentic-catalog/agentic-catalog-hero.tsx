import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Stat } from '@/components/ui/stat';
import { getTelemetryGuide } from '@/lib/agentx/agentx-telemetry-zh';
import type { Locale } from '@/lib/i18n/i18n';

import { AgenticCatalogLink } from './agentic-catalog-link';

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
        <h1 className="mt-2 max-w-3xl text-2xl font-semibold text-foreground lg:text-3xl">
          {guide.title}
        </h1>
        <p className="mt-3 max-w-4xl text-base leading-7 text-muted-foreground lg:text-lg">
          {guide.lead}
        </p>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{t.catalogLead}</p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          {guide.highlights.map((item) => (
            <Stat
              key={item.label}
              valueFirst
              label={item.label}
              value={item.value}
              valueClassName="text-xl"
            />
          ))}
        </dl>

        <div className="mt-6">
          <Button asChild variant="brand" size="lg">
            <AgenticCatalogLink
              data-testid="agentic-catalog-tutorial-link"
              href={`${prefix}/agentx/telemetry`}
              analyticsEvent="agentic_catalog_tutorial_clicked"
            >
              {t.readTutorial}
              <ArrowRight aria-hidden="true" />
            </AgenticCatalogLink>
          </Button>
        </div>
      </Card>
    </section>
  );
}
