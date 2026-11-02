'use client';

import type { CaseChange } from '@semianalysisai/inferencex-db/collectivex/changelog';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useCollectiveXChangelog } from '@/hooks/api/use-collectivex';
import { useLocale } from '@/lib/i18n/use-locale';

import type { CollectiveXVersion } from './types';

const STRINGS = {
  en: {
    title: 'Changelog',
    description:
      'Each PR that changed what CollectiveX measures, from collectivex/perf-changelog.yaml, with the cases its upload changed: pair period p50 before → after, at the smallest and largest token count.',
    new: 'new',
    more: (count: number) => `and ${count} more`,
  },
  zh: {
    title: '变更记录',
    description:
      '来自 collectivex/perf-changelog.yaml 的每个改变 CollectiveX 测量内容的 PR，以及其上传所改变的用例：最小与最大 token 数下的 pair period p50（之前 → 之后）。',
    new: '新增',
    more: (count: number) => `另有 ${count} 个`,
  },
};

const SHOWN = 6;

function point(change: CaseChange, pick: 0 | -1, newLabel: string): string {
  const after = change.after.pair_period_p50_us.at(pick);
  if (!after) return '';
  const before = change.before?.pair_period_p50_us.find(([tokens]) => tokens === after[0]);
  if (!before) return `T=${after[0]}: ${after[1]} µs (${newLabel})`;
  const delta = Math.round(((after[1] - before[1]) / before[1]) * 100);
  return `T=${after[0]}: ${before[1]} → ${after[1]} µs (${delta > 0 ? '+' : ''}${delta}%)`;
}

export function CollectiveXChangelog({ version }: { version: CollectiveXVersion }) {
  const t = STRINGS[useLocale()];
  const entries = useCollectiveXChangelog(version).data?.entries ?? [];
  if (entries.length === 0) return null;
  return (
    <Card data-testid="collectivex-changelog" className="min-w-0">
      <Heading level="card">{t.title}</Heading>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.description}</p>
      <ol className="mt-4 grid gap-4">
        {entries.map((entry) => (
          <li key={`${entry.run_id}-${entry.entry_index}`} className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-muted-foreground">{entry.date}</span>
              <a
                className="font-semibold underline"
                href={entry.pr_link}
                target="_blank"
                rel="noreferrer"
              >
                #{entry.pr_number}
              </a>
              <span className="text-xs text-muted-foreground">{entry.pools.join(', ')}</span>
            </div>
            <p className="mt-1 whitespace-pre-line">{entry.description}</p>
            <ul className="mt-1 font-mono text-xs text-muted-foreground">
              {entry.changes.slice(0, SHOWN).map((change) => (
                <li key={`${change.sku}/${change.case_id}`}>
                  {change.case_id}
                  {[...new Set([point(change, 0, t.new), point(change, -1, t.new)])]
                    .filter(Boolean)
                    .map((text) => ` · ${text}`)}
                </li>
              ))}
              {entry.changes.length > SHOWN ? (
                <li>{t.more(entry.changes.length - SHOWN)}</li>
              ) : null}
            </ul>
          </li>
        ))}
      </ol>
    </Card>
  );
}
