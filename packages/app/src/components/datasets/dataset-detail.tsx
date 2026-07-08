'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DistributionCard } from '@/components/datasets/distribution-card';
import {
  useDataset,
  useDatasetConversations,
  type ConversationSort,
} from '@/hooks/api/use-datasets';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { compact, formatPct, formatShare, perConversation } from './format';
import { Stat } from './stat';

const PAGE = 50;

const STRINGS = {
  en: {
    loading: 'Loading dataset…',
    notFound: 'Dataset not found.',
    backToDatasets: 'Back to datasets',
    breadcrumbDatasets: '← Datasets',
    viewOnHf: 'View on HuggingFace ↗',
    conversations: 'Conversations',
    medianReqConvo: 'Median requests / convo',
    meanReqConvo: 'Mean requests / convo',
    mainTurns: 'Main turns',
    medianSubagents: 'Median subagents / trace',
    meanSubagents: 'Mean subagents / trace',
    cachedInput: 'Cached input',
    totalTokens: 'Total tokens',
    modelMix: 'Model mix (turns)',
    distributions: 'Distributions',
    inputTokensPerTurn: 'Input tokens per turn',
    outputTokensPerTurn: 'Output tokens per turn',
    uncachedInputPerReq: 'Uncached input tokens per request',
    turnsPerConvo: 'Turns per conversation',
    subagentIsl: 'Subagent request ISL',
    subagentIslSub: 'Inner subagent requests only',
    subagentOsl: 'Subagent request OSL',
    subagentOslSub: 'Inner subagent requests only',
    cachedFraction: 'Cached fraction per turn',
    searchPlaceholder: 'Search by ID…',
    sortTokens: 'Total input ↓',
    sortTurns: 'Turns ↓',
    sortSubagents: 'Subagent groups ↓',
    sortId: 'Conversation ID',
    thConversation: 'Conversation',
    thTurns: 'Turns',
    thSubagents: 'Subagents',
    thInput: 'Input',
    thOutput: 'Output',
    thCached: 'Cached',
    modelSuffix: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    noMatch: 'No conversations match.',
    prev: '← Prev',
    next: 'Next →',
    pageOf: (p: number, total: number) => `Page ${p} of ${total}`,
  },
  zh: {
    loading: '正在加载数据集…',
    notFound: '未找到数据集。',
    backToDatasets: '返回数据集列表',
    breadcrumbDatasets: '← 数据集',
    viewOnHf: '在 HuggingFace 查看 ↗',
    conversations: '对话数',
    medianReqConvo: '每对话中位请求数',
    meanReqConvo: '每对话平均请求数',
    mainTurns: '主轮次',
    medianSubagents: '每 trace 中位 subagent 数',
    meanSubagents: '每 trace 平均 subagent 数',
    cachedInput: '缓存输入',
    totalTokens: '总 token 数',
    modelMix: '模型组合（按轮次）',
    distributions: '分布',
    inputTokensPerTurn: '每轮输入 token 数',
    outputTokensPerTurn: '每轮输出 token 数',
    uncachedInputPerReq: '每请求未缓存输入 token 数',
    turnsPerConvo: '每对话轮次数',
    subagentIsl: 'Subagent 请求 ISL',
    subagentIslSub: '仅内部 subagent 请求',
    subagentOsl: 'Subagent 请求 OSL',
    subagentOslSub: '仅内部 subagent 请求',
    cachedFraction: '每轮缓存比例',
    searchPlaceholder: '按 ID 搜索…',
    sortTokens: '总输入 ↓',
    sortTurns: '轮次 ↓',
    sortSubagents: 'Subagent 组 ↓',
    sortId: '对话 ID',
    thConversation: '对话',
    thTurns: '轮次',
    thSubagents: 'Subagent',
    thInput: '输入',
    thOutput: '输出',
    thCached: '缓存',
    modelSuffix: (n: number) => `${n} 个模型`,
    noMatch: '没有匹配的对话。',
    prev: '← 上一页',
    next: '下一页 →',
    pageOf: (p: number, total: number) => `第 ${p} 页，共 ${total} 页`,
  },
} as const;

export function DatasetDetail({ slug }: { slug: string }) {
  const { data: dataset, isLoading, isError } = useDataset(slug);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ConversationSort>('tokens');
  const [page, setPage] = useState(0);
  const locale = useLocale();
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  const sorts: { value: ConversationSort; label: string }[] = [
    { value: 'tokens', label: t.sortTokens },
    { value: 'turns', label: t.sortTurns },
    { value: 'subagents', label: t.sortSubagents },
    { value: 'id', label: t.sortId },
  ];

  const { data: convs, isFetching } = useDatasetConversations({
    slug,
    search,
    sort,
    limit: PAGE,
    offset: page * PAGE,
  });

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t.loading}</div>;
  }
  if (isError || !dataset) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        {t.notFound}{' '}
        <Link href={`${prefix}/datasets`} className="text-primary underline">
          {t.backToDatasets}
        </Link>
      </div>
    );
  }

  const s = dataset.summary ?? {};
  const cd = dataset.chart_data ?? {};
  const total = convs?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE);

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Link
            href={`${prefix}/datasets`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t.breadcrumbDatasets}
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{dataset.label}</h1>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-border/50 px-2 py-0.5 uppercase tracking-wide text-muted-foreground">
              {dataset.variant}
            </span>
            {dataset.hf_url && (
              <a
                href={dataset.hf_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('datasets_hf_link_clicked', { slug })}
                className="text-primary hover:underline"
              >
                {t.viewOnHf}
              </a>
            )}
          </div>
        </div>
        {dataset.description && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{dataset.description}</p>
        )}
      </div>

      {/* summary stats */}
      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label={t.conversations} value={dataset.conversation_count.toLocaleString()} />
          <Stat label={t.medianReqConvo} value={perConversation(s.medianRequestsPerConversation)} />
          <Stat label={t.meanReqConvo} value={perConversation(s.meanRequestsPerConversation)} />
          <Stat label={t.mainTurns} value={compact(s.mainTurns ?? 0)} />
          <Stat label={t.medianSubagents} value={perConversation(s.medianSubagentsPerTrace)} />
          <Stat label={t.meanSubagents} value={perConversation(s.meanSubagentsPerTrace)} />
          <Stat label={t.cachedInput} value={formatPct(s.cachedPct)} />
          <Stat label={t.totalTokens} value={compact((s.totalIn ?? 0) + (s.totalOut ?? 0))} />
        </dl>
        {s.modelMix && Object.keys(s.modelMix).length > 0 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t.modelMix}</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(s.modelMix)
                .toSorted((a, b) => b[1] - a[1])
                .map(([model, count]) => (
                  <span
                    key={model}
                    className="rounded-md border border-border/40 px-2 py-0.5 text-xs text-foreground"
                  >
                    {model} <span className="text-muted-foreground">{compact(count)}</span>
                  </span>
                ))}
            </div>
          </div>
        )}
      </Card>

      {/* distribution cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t.distributions}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <DistributionCard
            title={t.inputTokensPerTurn}
            unit="tokens"
            scale="log"
            distribution={cd.inputTokensPerTurn}
          />
          <DistributionCard
            title={t.outputTokensPerTurn}
            unit="tokens"
            scale="log"
            distribution={cd.outputTokensPerTurn}
          />
          <DistributionCard
            title={t.uncachedInputPerReq}
            unit="tokens"
            scale="log"
            distribution={cd.uncachedInputTokensPerTurn}
          />
          <DistributionCard
            title={t.turnsPerConvo}
            unit="turns"
            distribution={cd.turnsPerConversation}
          />
          <DistributionCard
            title={t.subagentIsl}
            subtitle={t.subagentIslSub}
            unit="tokens"
            scale="log"
            distribution={cd.subagentInputTokensPerRequest}
          />
          <DistributionCard
            title={t.subagentOsl}
            subtitle={t.subagentOslSub}
            unit="tokens"
            scale="log"
            distribution={cd.subagentOutputTokensPerRequest}
          />
          <DistributionCard
            title={t.cachedFraction}
            unit=""
            distribution={cd.cachedFractionPerTurn}
            formatValue={formatPct}
          />
        </div>
      </section>

      {/* conversation list */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {t.conversations}{' '}
            <span className="text-sm font-normal text-muted-foreground">({total})</span>
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={t.searchPlaceholder}
              className="h-8 w-40 rounded-md border border-border/40 bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as ConversationSort);
                setPage(0);
                track('datasets_conversations_sorted', { mode: v });
              }}
            >
              <SelectTrigger className="h-8 w-[12rem] text-xs" aria-label="Sort conversations">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorts.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t.thConversation}</th>
                <th className="px-3 py-2 text-right font-medium">{t.thTurns}</th>
                <th className="px-3 py-2 text-right font-medium">{t.thSubagents}</th>
                <th className="px-3 py-2 text-right font-medium">{t.thInput}</th>
                <th className="px-3 py-2 text-right font-medium">{t.thOutput}</th>
                <th className="px-3 py-2 text-right font-medium">{t.thCached}</th>
              </tr>
            </thead>
            <tbody>
              {(convs?.items ?? []).map((c) => {
                const cachedPct = formatShare(c.total_cached, c.total_in);
                return (
                  <tr
                    key={c.conv_id}
                    className="border-b border-border/20 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`${prefix}/datasets/${slug}/conversations/${encodeURIComponent(c.conv_id)}`}
                        onClick={() => track('datasets_conversation_clicked', { slug })}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {c.conv_id.slice(0, 20)}…
                      </Link>
                      {c.models.length > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {t.modelSuffix(c.models.length)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.num_turns}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.num_subagent_groups}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compact(c.total_in)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compact(c.total_out)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {cachedPct}
                    </td>
                  </tr>
                );
              })}
              {!isFetching && (convs?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {t.noMatch}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 text-xs">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => {
                const next = Math.max(0, page - 1);
                track('datasets_conversations_page_changed', { direction: 'prev', page: next });
                setPage(next);
              }}
              className="rounded-md border border-border/40 px-2 py-1 hover:bg-accent disabled:opacity-30"
            >
              {t.prev}
            </button>
            <span className="text-muted-foreground">{t.pageOf(page + 1, pageCount)}</span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => {
                const next = Math.min(pageCount - 1, page + 1);
                track('datasets_conversations_page_changed', { direction: 'next', page: next });
                setPage(next);
              }}
              className="rounded-md border border-border/40 px-2 py-1 hover:bg-accent disabled:opacity-30"
            >
              {t.next}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
