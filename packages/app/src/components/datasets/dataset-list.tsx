'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { useDatasets, type DatasetRecord } from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { compact, formatPct, perConversation } from './format';

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
    viewDataset: 'View dataset →',
  },
  zh: {
    loading: '正在加载数据集…',
    error: '数据集加载失败。',
    empty: '尚未导入数据集。',
    conversations: '对话数',
    medianReqConvo: '每对话中位请求数',
    meanReqConvo: '每对话平均请求数',
    mainTurns: '主轮次',
    subagentGroups: 'Subagent 组',
    cachedInput: '缓存输入',
    totalInput: '总输入',
    totalOutput: '总输出',
    viewDataset: '查看数据集 →',
  },
} as const;

function DatasetCard({ d, locale }: { d: DatasetRecord; locale: 'en' | 'zh' }) {
  const t = STRINGS[locale];
  const s = d.summary ?? {};
  const cachedPct = formatPct(s.cachedPct);
  const prefix = locale === 'zh' ? '/zh' : '';
  return (
    <Link
      href={`${prefix}/datasets/${d.slug}`}
      onClick={() => track('datasets_card_clicked', { slug: d.slug })}
      className="block transition-colors hover:[&_*]:border-primary/40"
    >
      <Card className="h-full p-4 transition-colors hover:border-primary/40">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">{d.label}</h3>
          <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {d.variant}
          </span>
        </div>
        {d.description && (
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Stat label={t.conversations} value={d.conversation_count.toLocaleString()} />
          <Stat label={t.medianReqConvo} value={perConversation(s.medianRequestsPerConversation)} />
          <Stat label={t.meanReqConvo} value={perConversation(s.meanRequestsPerConversation)} />
          <Stat label={t.mainTurns} value={compact(s.mainTurns ?? 0)} />
          <Stat label={t.subagentGroups} value={compact(s.subagentGroups ?? 0)} />
          <Stat label={t.cachedInput} value={cachedPct} />
          <Stat label={t.totalInput} value={`${compact(s.totalIn ?? 0)} tok`} />
          <Stat label={t.totalOutput} value={`${compact(s.totalOut ?? 0)} tok`} />
        </dl>
        <div className="mt-3 text-xs font-medium text-primary">{t.viewDataset}</div>
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
