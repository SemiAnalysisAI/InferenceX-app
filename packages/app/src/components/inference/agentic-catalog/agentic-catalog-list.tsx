import { Card } from '@/components/ui/card';
import type { AgenticCatalogModelGroup } from '@/lib/agentic-catalog';
import type { Locale } from '@/lib/i18n';

import { AgenticCatalogCardLink } from './agentic-catalog-link';

/**
 * Model-grouped catalog of the AgentX runs that have stored telemetry, laid
 * out the way `/compare` lays out its comparison catalog: a summary card, then
 * one `<section>` per model holding a grid of link cards.
 *
 * One card per (hardware, framework, precision) config rather than per point.
 * There are hundreds of trace-backed points, and the detail page carries a
 * sibling navigator, so a card opens that config's representative point and
 * the reader moves between concurrencies from there.
 */

const STRINGS = {
  en: {
    eyebrow: 'Telemetry catalog',
    heading: 'AgentX runs with stored telemetry',
    summary: (configs: number, points: number, models: number) =>
      `${configs.toLocaleString()} serving configurations across ${models} models, covering ${points.toLocaleString()} benchmark points with per-request telemetry. Each card opens that configuration's headline point; the detail page's navigator moves between its concurrencies.`,
    empty: 'No AgentX runs currently have stored telemetry.',
    configs: (n: number) => `${n} configuration${n === 1 ? '' : 's'}`,
    points: (n: number) => `${n.toLocaleString()} point${n === 1 ? '' : 's'}`,
    detail: (points: number, minConc: number, maxConc: number, date: string) =>
      `${points} points · conc ${minConc}–${maxConc} · ${date}`,
  },
  zh: {
    eyebrow: '遥测数据目录',
    heading: '已存储遥测数据的 AgentX 运行',
    summary: (configs: number, points: number, models: number) =>
      `覆盖 ${models} 个模型的 ${configs.toLocaleString()} 种推理服务配置，共 ${points.toLocaleString()} 个带有逐请求遥测数据的基准测试数据点。每张卡片打开该配置的代表性数据点，详情页的导航器可在其各并发档位之间切换。`,
    empty: '当前没有 AgentX 运行存储了遥测数据。',
    configs: (n: number) => `${n} 种配置`,
    points: (n: number) => `${n.toLocaleString()} 个数据点`,
    detail: (points: number, minConc: number, maxConc: number, date: string) =>
      `${points} 个数据点 · 并发 ${minConc}–${maxConc} · ${date}`,
  },
} as const;

export function AgenticCatalogList({
  groups,
  locale,
}: {
  groups: AgenticCatalogModelGroup[];
  locale: Locale;
}) {
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';
  const configCount = groups.reduce((sum, group) => sum + group.cards.length, 0);
  const pointCount = groups.reduce((sum, group) => sum + group.totalPoints, 0);

  return (
    <>
      <section id="telemetry-catalog" data-testid="agentic-catalog-summary">
        <Card>
          <p className="font-mono text-xs font-semibold tracking-eyebrow text-muted-foreground uppercase">
            {t.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl">{t.heading}</h2>
          <p className="mt-3 max-w-4xl text-base text-muted-foreground lg:text-lg">
            {groups.length === 0 ? t.empty : t.summary(configCount, pointCount, groups.length)}
          </p>
        </Card>
      </section>

      {groups.map((group) => (
        <section key={group.key} id={group.key} data-testid={`agentic-catalog-model-${group.key}`}>
          <Card className="flex flex-col gap-4">
            <div>
              <h3 className="text-xl font-bold tracking-tight lg:text-2xl">{group.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.configs(group.cards.length)} · {t.points(group.totalPoints)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card) => (
                <AgenticCatalogCardLink
                  key={card.id}
                  href={`${prefix}/inference/agentic/${card.id}`}
                  label={card.label}
                  archLine={`${card.vendor} · ${card.arch}`}
                  precisionLabel={card.precisionLabel}
                  detailLine={t.detail(card.points, card.minConc, card.maxConc, card.latestDate)}
                  // Precision is part of the key: a model/SKU/engine can ship
                  // both an FP4 and an FP8 config, and the two are separate
                  // cards that must not collide on the same test id.
                  target={`${group.key}-${card.hardwareKey}-${card.frameworkLabel}-${card.precisionLabel}`
                    .toLowerCase()
                    .replaceAll(/[^a-z0-9]+/gu, '-')}
                />
              ))}
            </div>
          </Card>
        </section>
      ))}
    </>
  );
}
