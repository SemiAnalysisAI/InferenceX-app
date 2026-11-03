'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { useDatasets, type DatasetRecord } from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { getDatasetDescription } from './dataset-description';
import { compact, formatPct, localeNumber, perConversation } from './format';

const STRINGS = {
  en: {
    loading: 'Loading datasets…',
    error: 'Failed to load datasets',
    empty: 'No datasets ingested yet',
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
    viewDataset: 'View dataset',
  },
  zh: {
    loading: '正在加载数据集…',
    error: '数据集加载失败',
    empty: '尚无已导入的数据集',
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
    viewDataset: '查看数据集',
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
      className="group block"
    >
      <Card className="h-full p-4 transition-colors group-hover:bg-muted/40">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-medium text-foreground">{d.label}</h3>
          <span className="font-mono text-xs text-muted-foreground">{d.variant}</span>
        </div>
        {description && (
          <p
            data-testid="dataset-description"
            className="mb-3 min-h-8 line-clamp-2 text-xs text-muted-foreground"
          >
            {description}
          </p>
        )}
        <dl className="mb-3">
          <Stat
            size="lg"
            label={t.conversations}
            value={localeNumber(d.conversation_count, locale)}
          />
        </dl>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:gap-x-8">
          <section className="min-w-0" aria-labelledby={`${d.slug}-request-shape`}>
            <h4
              id={`${d.slug}-request-shape`}
              className="mb-1.5 text-xs font-medium text-muted-foreground"
            >
              {t.requestShape}
            </h4>
            <dl className="grid gap-y-1.5 text-xs">
              <MetricRow
                label={t.medianReqConvo}
                value={perConversation(s.medianRequestsPerConversation, locale)}
              />
              <MetricRow
                label={t.meanReqConvo}
                value={perConversation(s.meanRequestsPerConversation, locale)}
              />
              <MetricRow label={t.mainTurns} value={compact(s.mainTurns ?? 0)} />
              <MetricRow label={t.subagentGroups} value={compact(s.subagentGroups ?? 0)} />
            </dl>
          </section>
          <section className="min-w-0" aria-labelledby={`${d.slug}-token-volume`}>
            <h4
              id={`${d.slug}-token-volume`}
              className="mb-1.5 text-xs font-medium text-muted-foreground"
            >
              {t.tokenVolume}
            </h4>
            <dl className="grid gap-y-1.5 text-xs">
              <MetricRow label={t.cachedInput} value={cachedPct} />
              <MetricRow label={t.totalInput} value={`${compact(s.totalIn ?? 0)} tok`} />
              <MetricRow label={t.totalOutput} value={`${compact(s.totalOut ?? 0)} tok`} />
            </dl>
          </section>
        </div>
        <div className="mt-auto flex items-center gap-1 border-t border-border/20 pt-3 text-sm font-medium text-brand">
          {t.viewDataset}
          <ArrowRight aria-hidden="true" className="size-4" />
        </div>
      </Card>
    </Link>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-nowrap tabular-nums font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function DatasetList() {
  const { data, isLoading, isError } = useDatasets();
  const locale = useLocale();
  const t = STRINGS[locale];

  if (isLoading) {
    return <EmptyState>{t.loading}</EmptyState>;
  }
  if (isError || !data) {
    return <EmptyState className="text-destructive">{t.error}</EmptyState>;
  }
  if (data.length === 0) {
    return <EmptyState>{t.empty}</EmptyState>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.map((d) => (
        <DatasetCard key={d.id} d={d} locale={locale} />
      ))}
    </div>
  );
}
