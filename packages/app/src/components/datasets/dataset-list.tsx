'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { useDatasets, type DatasetRecord } from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { getDatasetDescription } from './dataset-description';
import { compact, formatPct, localeNumber, perConversation } from './format';

const STRINGS = {
  en: {
    loading: 'Loading datasets…',
    error: 'Failed to load datasets.',
    empty: 'No datasets ingested yet.',
    conversations: 'Conversations',
    medianReqConvo: 'Median requests / convo',
    meanReqConvo: 'Mean requests / convo',
    mainTurns: 'Main turns',
    subagentGroups: 'Subagent groups',
    cachedInput: 'Cached input',
    totalInput: 'Total input',
    totalOutput: 'Total output',
    requestShape: 'Request shape',
    tokenVolume: 'Token volume',
    viewDataset: 'View dataset →',
  },
  zh: {
    loading: '正在加载数据集…',
    error: '数据集加载失败。',
    empty: '尚无已导入的数据集。',
    conversations: '会话数',
    medianReqConvo: '单会话请求数中位数',
    meanReqConvo: '单会话平均请求数',
    mainTurns: 'main agent 轮次',
    subagentGroups: 'subagent 组',
    cachedInput: 'cached input 占比',
    totalInput: 'input token 总数',
    totalOutput: 'output token 总数',
    requestShape: '请求结构',
    tokenVolume: 'Token 规模',
    viewDataset: '查看数据集 →',
  },
} as const;

function DatasetCard({ d, locale }: { d: DatasetRecord; locale: 'en' | 'zh' }) {
  const t = STRINGS[locale];
  const description = getDatasetDescription(d, locale);
  const s = d.summary ?? {};
  const cachedPct = formatPct(s.cachedPct);
  const prefix = locale === 'zh' ? '/zh' : '';
  return (
    <Link
      href={`${prefix}/agentx/${d.slug}`}
      onClick={() => track('datasets_card_clicked', { slug: d.slug })}
      className="block transition-colors hover:[&_*]:border-primary/40"
    >
      <Card className="h-full p-4 transition-colors hover:border-primary/40">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">{d.label}</h3>
          <span className="rounded-full border border-border/50 px-2 py-0.5 text-3xs uppercase tracking-wide text-muted-foreground">
            {d.variant}
          </span>
        </div>
        {description && (
          <p
            data-testid="dataset-description"
            className="mb-3 min-h-8 line-clamp-2 text-xs text-muted-foreground"
          >
            {description}
          </p>
        )}
        <div className="mb-3 rounded-lg border border-border/40 bg-muted/20 p-3">
          <div className="text-2xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            {t.conversations}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {localeNumber(d.conversation_count, locale)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="min-w-0" aria-labelledby={`${d.slug}-request-shape`}>
            <h4
              id={`${d.slug}-request-shape`}
              className="mb-1.5 text-2xs font-medium uppercase tracking-eyebrow text-muted-foreground"
            >
              {t.requestShape}
            </h4>
            <dl className="grid gap-y-1.5 text-xs">
              <Stat
                label={t.medianReqConvo}
                value={perConversation(s.medianRequestsPerConversation, locale)}
              />
              <Stat
                label={t.meanReqConvo}
                value={perConversation(s.meanRequestsPerConversation, locale)}
              />
              <Stat label={t.mainTurns} value={compact(s.mainTurns ?? 0)} />
              <Stat label={t.subagentGroups} value={compact(s.subagentGroups ?? 0)} />
            </dl>
          </section>
          <section className="min-w-0" aria-labelledby={`${d.slug}-token-volume`}>
            <h4
              id={`${d.slug}-token-volume`}
              className="mb-1.5 text-2xs font-medium uppercase tracking-eyebrow text-muted-foreground"
            >
              {t.tokenVolume}
            </h4>
            <dl className="grid gap-y-1.5 text-xs">
              <Stat label={t.cachedInput} value={cachedPct} />
              <Stat label={t.totalInput} value={`${compact(s.totalIn ?? 0)} tok`} />
              <Stat label={t.totalOutput} value={`${compact(s.totalOut ?? 0)} tok`} />
            </dl>
          </section>
        </div>
        <div className="mt-4 border-t border-border/40 pt-3 text-xs font-medium text-primary">
          {t.viewDataset}
        </div>
      </Card>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function DatasetList() {
  const { data, isLoading, isError } = useDatasets();
  const locale = useLocale();
  const t = STRINGS[locale];

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t.loading}</div>;
  }
  if (isError || !data) {
    return <div className="py-12 text-center text-sm text-destructive">{t.error}</div>;
  }
  if (data.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t.empty}</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.map((d) => (
        <DatasetCard key={d.id} d={d} locale={locale} />
      ))}
    </div>
  );
}
